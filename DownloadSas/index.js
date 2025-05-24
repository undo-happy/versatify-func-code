const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { createPresignedUrl }         = require("@aws-sdk/s3-request-presigner");

module.exports = async function(context, req) {
  const file = req.query.file || (req.body && req.body.file);
  if (!file) {
    context.res = { status: 400, body: "file 파라미터 필요" };
    return;
  }

  const s3 = new S3Client({
    region:   "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY
    }
  });

  const url = await createPresignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: file }),
    { expiresIn: 5 * 60 }  // 5분
  );

  context.res = { body: { downloadUrl: url } };
}; 