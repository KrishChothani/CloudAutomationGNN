###############################################################################
# variables.tf
# Input variables for the CloudAutomationGNN infrastructure
###############################################################################

variable "aws_region" {
  description = "AWS region to deploy all resources"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "project_name" {
  description = "Project name prefix for all resource names"
  type        = string
  default     = "cloud-automation-gnn"
}

variable "model_bucket_name" {
  description = "S3 bucket name for storing trained GNN model artefacts"
  type        = string
  default     = "cloud-automation-gnn-models"
}

variable "lambda_memory_mb" {
  description = "Memory in MB for the Lambda function"
  type        = number
  default     = 512

  validation {
    condition     = var.lambda_memory_mb >= 128 && var.lambda_memory_mb <= 10240
    error_message = "Lambda memory must be between 128 and 10240 MB."
  }
}

variable "lambda_timeout_seconds" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 29
}

variable "sqs_visibility_timeout" {
  description = "SQS message visibility timeout in seconds"
  type        = number
  default     = 300
}

variable "dynamodb_billing_mode" {
  description = "DynamoDB billing mode (PAY_PER_REQUEST or PROVISIONED)"
  type        = string
  default     = "PAY_PER_REQUEST"
}

variable "eventbridge_schedule" {
  description = "EventBridge schedule expression for periodic metric polling"
  type        = string
  default     = "rate(5 minutes)"
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default = {
    Project     = "CloudAutomationGNN"
    ManagedBy   = "Terraform"
    Owner       = "CloudOps"
  }
}
