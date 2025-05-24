const fs = require("fs").promises;
const { execSync } = require("child_process");
const { v4: uuid } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

module.exports = async function(context, blob) {
  // 1) 원본 파일 임시 저장
  const inFile  = `/tmp/${uuid()}.pptx`;
  const outFile = `/tmp/${uuid()}.pdf`;
  await fs.writeFile(inFile, blob);

  // 2) LibreOffice로 PDF 변환
  execSync(`libreoffice --headless --convert-to pdf ${inFile} --outdir /tmp`);

  // 3) Cloudflare R2 클라이언트
  const s3 = new S3Client({
    region:   "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY
    }
  });

  // 4) 변환된 PDF 읽어서 업로드
  const pdf   = await fs.readFile(outFile);
  const key   = `${uuid()}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket:      process.env.R2_BUCKET,
    Key:         key,
    Body:        pdf,
    ContentType: "application/pdf",
    Metadata:    { ttl: "600" }  // 10분 TTL
  }));

  context.log(`✅ Uploaded ${key}`);
}; 