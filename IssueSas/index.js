const {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions
} = require("@azure/storage-blob");

/**
 *  HTTP  GET/POST  /api/IssueSas?name=파일이름
 *  → 15분짜리 업로드 URL(JSON) 반환
 */
module.exports = async function (context, req) {

  // ❶ 파일 이름 파라미터 확인
  const file = req.query.name || (req.body && req.body.name);
  if (!file) {
    return { status: 400, body: "name 파라미터가 필요합니다" };
  }

  // ❷ 스토리지 계정 자격 증명 (앱 설정에 넣어둔 값)
  const account = process.env.STORAGE_ACCOUNT;   // ex) versatifystorage
  const key     = process.env.STORAGE_KEY;       // Access keys > key1
  const cred    = new StorageSharedKeyCredential(account, key);

  // ❸ SAS 토큰 생성 – uploads 컨테이너, 15 분, create/write/read 권한
  const sas = generateBlobSASQueryParameters(
    {
      containerName: "uploads",
      blobName:      file,
      permissions:   BlobSASPermissions.parse("cwr"),
      expiresOn:     new Date(Date.now() + 15 * 60 * 1000)
    },
    cred
  ).toString();

  // ❹ 업로드용 URL 반환
  const url =
    `https://${account}.blob.core.windows.net/uploads/${file}?${sas}`;

  return { body: { uploadUrl: url } };
};
