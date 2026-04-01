###############################################################################
# lambda.tf
# AWS Lambda function, IAM execution role, and API Gateway HTTP API
###############################################################################

###############################################################################
# IAM — Lambda Execution Role
###############################################################################
resource "aws_iam_role" "lambda_exec_role" {
  name = "${local.prefix}-lambda-exec-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })
}

# Basic Lambda execution (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Custom inline policy — DynamoDB, SQS, S3, CloudWatch
resource "aws_iam_role_policy" "lambda_custom_policy" {
  name = "${local.prefix}-lambda-policy"
  role = aws_iam_role.lambda_exec_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchWriteItem",
        ]
        Resource = [
          aws_dynamodb_table.anomaly_table.arn,
          "${aws_dynamodb_table.anomaly_table.arn}/index/*",
          aws_dynamodb_table.automation_log_table.arn,
        ]
      },
      {
        Sid    = "SQSAccess"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:SendMessage",
        ]
        Resource = [
          aws_sqs_queue.event_queue.arn,
          aws_sqs_queue.event_dlq.arn,
        ]
      },
      {
        Sid    = "S3ModelAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:HeadObject",
        ]
        Resource = "${aws_s3_bucket.model_bucket.arn}/*"
      },
      {
        Sid    = "CloudWatchMetrics"
        Effect = "Allow"
        Action = [
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:ListMetrics",
          "cloudwatch:PutMetricData",
        ]
        Resource = "*"
      },
      {
        Sid    = "XRayTracing"
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
        ]
        Resource = "*"
      }
    ]
  })
}

###############################################################################
# Lambda — Dummy bootstrap zip (replaced by CI/CD on real deploys)
###############################################################################
data "archive_file" "lambda_dummy" {
  type        = "zip"
  output_path = "${path.module}/dummy_lambda.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'Deploying...' });"
    filename = "index.js"
  }
}

###############################################################################
# Lambda — API Function
###############################################################################
resource "aws_lambda_function" "api_function" {
  function_name = "${local.prefix}-api"
  role          = aws_iam_role.lambda_exec_role.arn

  # Bootstrap with a dummy zip; real code is deployed via:
  #   aws lambda update-function-code --function-name <name> --zip-file fileb://node-backend.zip
  filename         = data.archive_file.lambda_dummy.output_path
  source_code_hash = data.archive_file.lambda_dummy.output_base64sha256

  handler = "lambda.handler"
  runtime = "nodejs20.x"

  memory_size = var.lambda_memory_mb
  timeout     = var.lambda_timeout_seconds

  # Enable X-Ray active tracing
  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      NODE_ENV          = var.environment
      DYNAMODB_ANOMALY_TABLE = aws_dynamodb_table.anomaly_table.name
      DYNAMODB_LOG_TABLE     = aws_dynamodb_table.automation_log_table.name
      SQS_QUEUE_URL          = aws_sqs_queue.event_queue.url
      MODEL_BUCKET           = aws_s3_bucket.model_bucket.bucket
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic,
    aws_iam_role_policy.lambda_custom_policy,
    aws_cloudwatch_log_group.lambda_logs,
  ]
}

###############################################################################
# Lambda — Event Processor Function (SQS-triggered)
###############################################################################
resource "aws_lambda_function" "event_processor" {
  function_name = "${local.prefix}-event-processor"
  role          = aws_iam_role.lambda_exec_role.arn

  filename         = data.archive_file.lambda_dummy.output_path
  source_code_hash = data.archive_file.lambda_dummy.output_base64sha256

  handler     = "lambda.handler"
  runtime     = "nodejs20.x"
  memory_size = 256
  timeout     = 60

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      NODE_ENV               = var.environment
      DYNAMODB_ANOMALY_TABLE = aws_dynamodb_table.anomaly_table.name
      DYNAMODB_LOG_TABLE     = aws_dynamodb_table.automation_log_table.name
      SQS_QUEUE_URL          = aws_sqs_queue.event_queue.url
      MODEL_BUCKET           = aws_s3_bucket.model_bucket.bucket
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic,
    aws_iam_role_policy.lambda_custom_policy,
    aws_cloudwatch_log_group.event_processor_logs,
  ]
}

# SQS → Lambda event source mapping
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn                   = aws_sqs_queue.event_queue.arn
  function_name                      = aws_lambda_function.event_processor.arn
  batch_size                         = 10
  maximum_batching_window_in_seconds = 30
  enabled                            = true

  function_response_types = ["ReportBatchItemFailures"]
}

# EventBridge → Lambda for periodic polling
resource "aws_cloudwatch_event_target" "periodic_poll_to_lambda" {
  rule      = aws_cloudwatch_event_rule.metric_poll_rule.name
  target_id = "PeriodicMetricPoll"
  arn       = aws_lambda_function.event_processor.arn
}

resource "aws_lambda_permission" "allow_eventbridge_poll" {
  statement_id  = "AllowEventBridgePeriodicPoll"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.event_processor.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.metric_poll_rule.arn
}

###############################################################################
# API Gateway — HTTP API (v2)
###############################################################################
resource "aws_apigatewayv2_api" "http_api" {
  name          = "${local.prefix}-http-api"
  protocol_type = "HTTP"
  description   = "CloudAutomationGNN REST API"

  cors_configuration {
    allow_headers = ["Content-Type", "Authorization"]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_origins = ["*"]
    max_age       = 86400
  }
}

resource "aws_apigatewayv2_stage" "default_stage" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.lambda_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      sourceIp       = "$context.identity.sourceIp"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      integrationError = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id             = aws_apigatewayv2_api.http_api.id
  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.api_function.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "catch_all" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "ANY /{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

resource "aws_lambda_permission" "allow_apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_function.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

###############################################################################
# Outputs
###############################################################################
output "api_gateway_url" {
  description = "API Gateway invoke URL"
  value       = aws_apigatewayv2_stage.default_stage.invoke_url
}

output "lambda_function_name" {
  description = "API Lambda function name"
  value       = aws_lambda_function.api_function.function_name
}

output "lambda_function_arn" {
  description = "API Lambda function ARN"
  value       = aws_lambda_function.api_function.arn
}

output "event_processor_arn" {
  description = "Event processor Lambda ARN"
  value       = aws_lambda_function.event_processor.arn
}
