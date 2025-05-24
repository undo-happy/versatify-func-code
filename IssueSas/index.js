const {
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions
} = require("@azure/storage-blob");

module.exports = async function(context, req) {
  const file = req.query.name || (req.body && req.body.name);
  if (!file) {
    context.res = { status: 400, body: "name 파라미터 필요" };
    return;
  }

  const account = process.env.STORAGE_ACCOUNT;
  const key     = process.env.STORAGE_KEY;
  const cred    = new StorageSharedKeyCredential(account, key);

  const sas = generateBlobSASQueryParameters({
    containerName: "uploads",
    blobName:      file,
    permissions:   BlobSASPermissions.parse("cwr"),
    expiresOn:     new Date(Date.now() + 15 * 60 * 1000)
  }, cred).toString();

  context.res = {
    body: { uploadUrl: `https://${account}.blob.core.windows.net/uploads/${file}?${sas}` }
  };
}; 