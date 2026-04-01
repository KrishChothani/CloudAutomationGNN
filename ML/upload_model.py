"""
upload_model.py
───────────────
Upload the trained gnn_model.pt to AWS S3.
Creates the bucket if it doesn't already exist.

Usage:
    python upload_model.py [--bucket my-bucket] [--key models/gnn_model.pt] [--model models/gnn_model.pt]

Requires:
    AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in environment or ~/.aws/credentials
"""

import os
import sys
import argparse
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


def get_s3_client(region: str):
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
    )


def ensure_bucket(client, bucket: str, region: str):
    """Create the S3 bucket if it doesn't exist."""
    try:
        client.head_bucket(Bucket=bucket)
        print(f"✅ Bucket '{bucket}' exists")
    except ClientError as e:
        if e.response["Error"]["Code"] == "404":
            print(f"⚙️  Creating bucket '{bucket}' in {region}...")
            if region == "us-east-1":
                client.create_bucket(Bucket=bucket)
            else:
                client.create_bucket(
                    Bucket=bucket,
                    CreateBucketConfiguration={"LocationConstraint": region},
                )
            # Enable versioning for model artefacts
            client.put_bucket_versioning(
                Bucket=bucket,
                VersioningConfiguration={"Status": "Enabled"},
            )
            print(f"✅ Bucket created with versioning enabled")
        else:
            raise


def upload_model(local_path: str, bucket: str, key: str, region: str):
    """Upload model.pt to S3 with content-type and metadata."""
    if not Path(local_path).exists():
        print(f"\n❌ Model file not found: {local_path}")
        print("   Run `python train_gnn.py` first to train the model.\n")
        sys.exit(1)

    file_size_kb = Path(local_path).stat().st_size / 1024
    print(f"\n📦 Uploading model:")
    print(f"   Local:  {local_path} ({file_size_kb:.1f} KB)")
    print(f"   Target: s3://{bucket}/{key}")

    client = get_s3_client(region)
    ensure_bucket(client, bucket, region)

    try:
        client.upload_file(
            local_path,
            bucket,
            key,
            ExtraArgs={
                "ContentType": "application/octet-stream",
                "Metadata": {
                    "model-type": "graphsage",
                    "framework": "pytorch-geometric",
                    "task": "node-anomaly-detection",
                },
            },
        )

        # Get object URL
        url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
        print(f"\n✅ Upload successful!")
        print(f"   S3 URI: s3://{bucket}/{key}")
        print(f"   URL:    {url}")
        return True

    except NoCredentialsError:
        print("\n❌ AWS credentials not found.")
        print("   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env\n")
        return False
    except ClientError as e:
        print(f"\n❌ Upload failed: {e}\n")
        return False


def main():
    parser = argparse.ArgumentParser(description="Upload GNN model to S3")
    parser.add_argument("--bucket", type=str,
                        default=os.getenv("MODEL_BUCKET", "cloud-automation-gnn-models-dev"))
    parser.add_argument("--key", type=str,
                        default=os.getenv("MODEL_KEY", "models/gnn_model.pt"))
    parser.add_argument("--model", type=str,
                        default="models/gnn_model.pt")
    parser.add_argument("--region", type=str,
                        default=os.getenv("AWS_REGION", "ap-south-1"))
    args = parser.parse_args()

    print("=" * 60)
    print("  CloudAutomationGNN — Model Upload to S3")
    print("=" * 60)

    success = upload_model(args.model, args.bucket, args.key, args.region)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
