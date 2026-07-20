// IAM policy templates shown in the Bedrock AssumeRole (cross-account) setup
// helper. Extracted from BedrockProviderCard so the card stays under the
// max-lines cap; pure copy-paste data, no logic.

export const TRUST_POLICY_TEMPLATE = `{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "arn:aws:iam::<ODLY_AWS_ACCOUNT_ID>:role/odly-bedrock-trust"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "<paste-external-id-here>"
      }
    }
  }]
}`;

export const PERMISSION_POLICY_TEMPLATE = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeModels",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:*:*:inference-profile/*"
      ]
    },
    {
      "Sid": "DiscoverModels",
      "Effect": "Allow",
      "Action": [
        "bedrock:ListFoundationModels",
        "bedrock:ListInferenceProfiles"
      ],
      "Resource": "*"
    }
  ]
}`;
