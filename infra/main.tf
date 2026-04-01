###############################################################################
# main.tf
# Core AWS infrastructure:
#   - Provider & backend config
#   - EventBridge rule (CloudWatch alarm state changes)
#   - SQS queue + dead-letter queue + EventBridge → SQS target
#   - DynamoDB table (anomaly results + automation logs)
#   - S3 bucket for model artefacts
###############################################################################

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  # Uncomment to use S3 remote state backend
  # backend "s3" {
  #   bucket         = "your-terraform-state-bucket"
  #   key            = "cloud-automation-gnn/terraform.tfstate"
  #   region         = "ap-south-1"
  #   dynamodb_table = "terraform-state-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Environment = var.environment
    })
  }
}

###############################################################################
# Locals
###############################################################################
locals {
  prefix = "${var.project_name}-${var.environment}"
}

###############################################################################
# S3 — Model Artefact Bucket
###############################################################################
resource "aws_s3_bucket" "model_bucket" {
  bucket = "${var.model_bucket_name}-${var.environment}"
}

resource "aws_s3_bucket_versioning" "model_bucket_versioning" {
  bucket = aws_s3_bucket.model_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "model_bucket_sse" {
  bucket = aws_s3_bucket.model_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "model_bucket_acl" {
  bucket                  = aws_s3_bucket.model_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

###############################################################################
# SQS — Cloud Event Queue + Dead Letter Queue
###############################################################################
resource "aws_sqs_queue" "event_dlq" {
  name                      = "${local.prefix}-event-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "event_queue" {
  name                       = "${local.prefix}-event-queue"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  message_retention_seconds  = 86400 # 1 day
  receive_wait_time_seconds  = 20    # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.event_dlq.arn
    maxReceiveCount     = 3
  })
}

# Allow EventBridge to send messages to SQS
resource "aws_sqs_queue_policy" "event_queue_policy" {
  queue_url = aws_sqs_queue.event_queue.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowEventBridge"
        Effect    = "Allow"
        Principal = { Service = "events.amazonaws.com" }
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.event_queue.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = aws_cloudwatch_event_rule.cloudwatch_alarm_rule.arn
          }
        }
      }
    ]
  })
}

###############################################################################
# EventBridge — CloudWatch Alarm State Change Rule
###############################################################################
resource "aws_cloudwatch_event_rule" "cloudwatch_alarm_rule" {
  name        = "${local.prefix}-cloudwatch-alarm-rule"
  description = "Capture CloudWatch Alarm state changes for GNN anomaly detection"

  event_pattern = jsonencode({
    source      = ["aws.cloudwatch"]
    detail-type = ["CloudWatch Alarm State Change"]
    detail = {
      state = {
        value = ["ALARM"]
      }
    }
  })

  state = "ENABLED"
}

# EventBridge periodic trigger for metric polling
resource "aws_cloudwatch_event_rule" "metric_poll_rule" {
  name                = "${local.prefix}-metric-poll-rule"
  description         = "Periodic trigger to poll CloudWatch metrics for GNN inference"
  schedule_expression = var.eventbridge_schedule
  state               = "ENABLED"
}

# EventBridge → SQS target
resource "aws_cloudwatch_event_target" "alarm_to_sqs" {
  rule      = aws_cloudwatch_event_rule.cloudwatch_alarm_rule.name
  target_id = "SendToSQS"
  arn       = aws_sqs_queue.event_queue.arn
}

###############################################################################
# DynamoDB — Anomaly Results Table
###############################################################################
resource "aws_dynamodb_table" "anomaly_table" {
  name         = "${local.prefix}-anomalies"
  billing_mode = var.dynamodb_billing_mode
  hash_key     = "anomalyId"
  range_key    = "timestamp"

  attribute {
    name = "anomalyId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "resourceId"
    type = "S"
  }

  attribute {
    name = "severity"
    type = "S"
  }

  # GSI — query by resourceId
  global_secondary_index {
    name            = "ResourceIdIndex"
    hash_key        = "resourceId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  # GSI — query by severity
  global_secondary_index {
    name            = "SeverityIndex"
    hash_key        = "severity"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }
}

###############################################################################
# DynamoDB — Automation Log Table
###############################################################################
resource "aws_dynamodb_table" "automation_log_table" {
  name         = "${local.prefix}-automation-logs"
  billing_mode = var.dynamodb_billing_mode
  hash_key     = "actionId"
  range_key    = "triggeredAt"

  attribute {
    name = "actionId"
    type = "S"
  }

  attribute {
    name = "triggeredAt"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }
}

###############################################################################
# CloudWatch — Log Groups
###############################################################################
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${local.prefix}-api"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "event_processor_logs" {
  name              = "/aws/lambda/${local.prefix}-event-processor"
  retention_in_days = 7
}

###############################################################################
# S3 — Frontend Hosting Bucket
###############################################################################
resource "aws_s3_bucket" "frontend_bucket" {
  bucket = "cloud-automation-gnn-frontend-${var.environment}"
}

resource "aws_s3_bucket_public_access_block" "frontend_bucket_acl" {
  bucket                  = aws_s3_bucket.frontend_bucket.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend_bucket_policy" {
  bucket = aws_s3_bucket.frontend_bucket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend_bucket.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.frontend_bucket_acl]
}

resource "aws_s3_bucket_website_configuration" "frontend_website" {
  bucket = aws_s3_bucket.frontend_bucket.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

###############################################################################
# Outputs
###############################################################################
output "sqs_queue_url" {
  description = "URL of the SQS event queue"
  value       = aws_sqs_queue.event_queue.url
}

output "sqs_queue_arn" {
  description = "ARN of the SQS event queue"
  value       = aws_sqs_queue.event_queue.arn
}

output "dynamodb_anomaly_table" {
  description = "DynamoDB anomaly table name"
  value       = aws_dynamodb_table.anomaly_table.name
}

output "dynamodb_log_table" {
  description = "DynamoDB automation log table name"
  value       = aws_dynamodb_table.automation_log_table.name
}

output "model_bucket_name" {
  description = "S3 model bucket name"
  value       = aws_s3_bucket.model_bucket.bucket
}

output "frontend_bucket_name" {
  description = "S3 frontend hosting bucket name"
  value       = aws_s3_bucket.frontend_bucket.bucket
}

output "frontend_website_url" {
  description = "URL of the static frontend website"
  value       = aws_s3_bucket_website_configuration.frontend_website.website_endpoint
}

output "eventbridge_rule_name" {
  description = "EventBridge CloudWatch alarm rule name"
  value       = aws_cloudwatch_event_rule.cloudwatch_alarm_rule.name
}
