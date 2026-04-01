---
description: Build the frontend for production and deploy to AWS S3
---

This workflow automates the process of building the React/Vite frontend into the `dist` folder and pushing it to a static AWS S3 hosting bucket.

## Step 1: Navigate to the Frontend directory
Move to the frontend folder where the `package.json` and React code reside.
// turbo
```bash
cd Frontend
```

## Step 2: Install dependencies
Install all the required npm packages.
// turbo
```bash
npm install
```

## Step 3: Build the frontend for production
Create the production-ready static files in the `dist` folder. First, we dynamically resolve your EC2 Python API's public URL so the frontend can hit it properly!
// turbo-all
```bash
$EC2_IP = aws ec2 describe-instances --instance-ids i-08b39b7c044b5005f --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
$env:VITE_PYTHON_API_URL = "http://$EC2_IP:8000"
$env:VITE_API_BASE_URL = "https://480itv48ze.execute-api.ap-south-1.amazonaws.com/dev/api/v1"
$env:VITE_WS_URL = ""
npm run build
```

## Step 4: Deploy to AWS S3
Deploy the built `dist` folder to your AWS S3 bucket. (Make sure your local AWS CLI is authenticated, or your deployment platform exports `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`).
// turbo
```bash
aws s3 sync dist/ s3://cloud-automation-gnn-frontend-dev --delete
```
