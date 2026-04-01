import logging
import boto3
from botocore.exceptions import ClientError
from pathlib import Path
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def _get_client():
    return boto3.client(
        "s3",
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )


def upload_file(local_path: str, bucket: str, key: str) -> bool:
    """Upload a local file to S3."""
    try:
        client = _get_client()
        client.upload_file(local_path, bucket, key)
        logger.info(f"Uploaded {local_path} → s3://{bucket}/{key}")
        return True
    except ClientError as e:
        logger.error(f"S3 upload failed: {e}")
        return False


def download_file(bucket: str, key: str, local_path: str) -> bool:
    """Download a file from S3 to local path."""
    try:
        client = _get_client()
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        client.download_file(bucket, key, local_path)
        logger.info(f"Downloaded s3://{bucket}/{key} → {local_path}")
        return True
    except ClientError as e:
        logger.error(f"S3 download failed: {e}")
        return False


def list_objects(bucket: str, prefix: str = "") -> list:
    """List objects in an S3 bucket/prefix."""
    try:
        client = _get_client()
        response = client.list_objects_v2(Bucket=bucket, Prefix=prefix)
        return [obj["Key"] for obj in response.get("Contents", [])]
    except ClientError as e:
        logger.error(f"S3 list failed: {e}")
        return []


def upload_model(model_path: str) -> bool:
    """Upload the trained GNN model to S3."""
    return upload_file(model_path, settings.MODEL_BUCKET, settings.MODEL_KEY)