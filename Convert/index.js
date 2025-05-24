const fs = require("fs").promises;
const path = require("path");
const { execSync } = require("child_process");
const { v4: uuid } = require("uuid");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

// 지원하는 파일 형식과 MIME 타입 매핑 (LibreOffice 7.4+ 기준)
const SUPPORTED_FORMATS = {
  // 문서 형식 (Writer)
  'odt': { mime: 'application/vnd.oasis.opendocument.text', convertTo: 'odt', type: 'document' },
  'fodt': { mime: 'application/vnd.oasis.opendocument.text-flat-xml', convertTo: 'fodt', type: 'document' },
  'doc': { mime: 'application/msword', convertTo: 'doc', type: 'document' },
  'docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', convertTo: 'docx', type: 'document' },
  'rtf': { mime: 'application/rtf', convertTo: 'rtf', type: 'document' },
  'txt': { mime: 'text/plain', convertTo: 'txt', type: 'text' },
  'html': { mime: 'text/html', convertTo: 'html', type: 'web' },
  'xhtml': { mime: 'application/xhtml+xml', convertTo: 'xhtml', type: 'web' },
  'pdf': { mime: 'application/pdf', convertTo: 'pdf', type: 'document' },
  'epub': { mime: 'application/epub+zip', convertTo: 'epub', type: 'ebook' },
  
  // 스프레드시트 (Calc)
  'ods': { mime: 'application/vnd.oasis.opendocument.spreadsheet', convertTo: 'ods', type: 'spreadsheet' },
  'fods': { mime: 'application/vnd.oasis.opendocument.spreadsheet-flat-xml', convertTo: 'fods', type: 'spreadsheet' },
  'xls': { mime: 'application/vnd.ms-excel', convertTo: 'xls', type: 'spreadsheet' },
  'xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', convertTo: 'xlsx', type: 'spreadsheet' },
  'xlsm': { mime: 'application/vnd.ms-excel.sheet.macroEnabled.12', convertTo: 'xlsm', type: 'spreadsheet' },
  'xltx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template', convertTo: 'xltx', type: 'spreadsheet' },
  'xlsb': { mime: 'application/vnd.ms-excel.sheet.binary.macroEnabled.12', convertTo: 'xlsb', type: 'spreadsheet' },
  'csv': { mime: 'text/csv', convertTo: 'csv', type: 'spreadsheet' },
  'tsv': { mime: 'text/tab-separated-values', convertTo: 'tsv', type: 'spreadsheet' },
  'dif': { mime: 'text/x-dif', convertTo: 'dif', type: 'spreadsheet' },
  'dbf': { mime: 'application/dbase', convertTo: 'dbf', type: 'database' },
  'uos': { mime: 'application/x-extension-uos', convertTo: 'uos', type: 'spreadsheet' },
  
  // 프레젠테이션 (Impress)
  'odp': { mime: 'application/vnd.oasis.opendocument.presentation', convertTo: 'odp', type: 'presentation' },
  'fodp': { mime: 'application/vnd.oasis.opendocument.presentation-flat-xml', convertTo: 'fodp', type: 'presentation' },
  'ppt': { mime: 'application/vnd.ms-powerpoint', convertTo: 'ppt', type: 'presentation' },
  'pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', convertTo: 'pptx', type: 'presentation' },
  'potx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.template', convertTo: 'potx', type: 'presentation' },
  'ppsx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow', convertTo: 'ppsx', type: 'presentation' },
  'pptm': { mime: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12', convertTo: 'pptm', type: 'presentation' },
  'potm': { mime: 'application/vnd.ms-powerpoint.template.macroEnabled.12', convertTo: 'potm', type: 'presentation' },
  'ppsm': { mime: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12', convertTo: 'ppsm', type: 'presentation' },
  'sdd': { mime: 'application/vnd.stardivision.impress', convertTo: 'sdd', type: 'presentation' },
  'sxd': { mime: 'application/vnd.sun.xml.draw', convertTo: 'sxd', type: 'drawing' },
  
  // 드로잉 (Draw)
  'odg': { mime: 'application/vnd.oasis.opendocument.graphics', convertTo: 'odg', type: 'drawing' },
  'fodg': { mime: 'application/vnd.oasis.opendocument.graphics-flat-xml', convertTo: 'fodg', type: 'drawing' },
  'svg': { mime: 'image/svg+xml', convertTo: 'svg', type: 'image' },
  'wmf': { mime: 'image/wmf', convertTo: 'wmf', type: 'image' },
  'emf': { mime: 'image/emf', convertTo: 'emf', type: 'image' },
  'vsd': { mime: 'application/vnd.visio', convertTo: 'vsd', type: 'drawing' },
  'vdx': { mime: 'application/vnd.visio', convertTo: 'vdx', type: 'drawing' },
  'vsdm': { mime: 'application/vnd.ms-visio.drawing.macroEnabled.12', convertTo: 'vsdm', type: 'drawing' },
  'vsdx': { mime: 'application/vnd.ms-visio.drawing', convertTo: 'vsdx', type: 'drawing' },
  'cdr': { mime: 'application/vnd.corel-draw', convertTo: 'cdr', type: 'drawing' },
  'cmx': { mime: 'image/x-cmx', convertTo: 'cmx', type: 'image' },
  'pub': { mime: 'application/x-mspublisher', convertTo: 'pub', type: 'publisher' },
  'pct': { mime: 'image/x-pict', convertTo: 'pct', type: 'image' },
  'pbm': { mime: 'image/x-portable-bitmap', convertTo: 'pbm', type: 'image' },
  'pcd': { mime: 'image/x-photo-cd', convertTo: 'pcd', type: 'image' },
  'pcx': { mime: 'image/x-pcx', convertTo: 'pcx', type: 'image' },
  'pgm': { mime: 'image/x-portable-graymap', convertTo: 'pgm', type: 'image' },
  'ppm': { mime: 'image/x-portable-pixmap', convertTo: 'ppm', type: 'image' },
  'ras': { mime: 'image/x-cmu-raster', convertTo: 'ras', type: 'image' },
  'std': { mime: 'application/vnd.sun.xml.draw.template', convertTo: 'std', type: 'drawing' },
  'sda': { mime: 'application/vnd.stardivision.draw', convertTo: 'sda', type: 'drawing' },
  'sdd': { mime: 'application/vnd.stardivision.impress', convertTo: 'sdd', type: 'presentation' },
  'sdc': { mime: 'application/vnd.stardivision.calc', convertTo: 'sdc', type: 'spreadsheet' },
  'sxd': { mime: 'application/vnd.sun.xml.draw', convertTo: 'sxd', type: 'drawing' },
  'sxi': { mime: 'application/vnd.sun.xml.impress', convertTo: 'sxi', type: 'presentation' },
  'sxm': { mime: 'application/vnd.sun.xml.math', convertTo: 'sxm', type: 'formula' },
  'sxw': { mime: 'application/vnd.sun.xml.writer', convertTo: 'sxw', type: 'document' },
  'vor': { mime: 'application/vnd.stardivision.writer', convertTo: 'vor', type: 'document' },
  'wpg': { mime: 'application/wordperfect', convertTo: 'wpg', type: 'image' },
  'wps': { mime: 'application/vnd.ms-works', convertTo: 'wps', type: 'document' },
  'wri': { mime: 'application/x-mswrite', convertTo: 'wri', type: 'document' },
  'xbm': { mime: 'image/x-xbitmap', convertTo: 'xbm', type: 'image' },
  'xpm': { mime: 'image/x-xpixmap', convertTo: 'xpm', type: 'image' },
  'zif': { mime: 'application/zip', convertTo: 'zif', type: 'archive' },
  'zip': { mime: 'application/zip', convertTo: 'zip', type: 'archive' },
  'zot': { mime: 'application/x-zip-compressed', convertTo: 'zot', type: 'archive' },
  'zabw': { mime: 'application/x-abiword', convertTo: 'zabw', type: 'document' },
  'abw': { mime: 'application/x-abiword', convertTo: 'abw', type: 'document' },
  '602': { mime: 'application/x-t602', convertTo: '602', type: 'document' },
  'lwp': { mime: 'application/vnd.lotus-wordpro', convertTo: 'lwp', type: 'document' },
  'hwp': { mime: 'application/x-hwp', convertTo: 'hwp', type: 'document' },
  'hwt': { mime: 'application/x-hwt', convertTo: 'hwt', type: 'document' },
  'dot': { mime: 'application/msword-template', convertTo: 'dot', type: 'document' },
  'dotx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template', convertTo: 'dotx', type: 'document' },
  'dotm': { mime: 'application/vnd.ms-word.template.macroEnabled.12', convertTo: 'dotm', type: 'document' },
  'docm': { mime: 'application/vnd.ms-word.document.macroEnabled.12', convertTo: 'docm', type: 'document' },
  'ott': { mime: 'application/vnd.oasis.opendocument.text-template', convertTo: 'ott', type: 'document' },
  'stw': { mime: 'application/vnd.sun.xml.writer.template', convertTo: 'stw', type: 'document' },
  'sxg': { mime: 'application/vnd.sun.xml.writer.global', convertTo: 'sxg', type: 'document' },
  'sxw': { mime: 'application/vnd.sun.xml.writer', convertTo: 'sxw', type: 'document' },
  'uot': { mime: 'application/vnd.uoml+xml', convertTo: 'uot', type: 'document' },
  'wps': { mime: 'application/vnd.ms-works', convertTo: 'wps', type: 'document' },
  'wri': { mime: 'application/x-mswrite', convertTo: 'wri', type: 'document' },
  'wpd': { mime: 'application/vnd.wordperfect', convertTo: 'wpd', type: 'document' },
  'wps': { mime: 'application/vnd.ms-works', convertTo: 'wps', type: 'document' },
  'wri': { mime: 'application/x-mswrite', convertTo: 'wri', type: 'document' },
  'wps': { mime: 'application/vnd.ms-works', convertTo: 'wps', type: 'document' },
  'wri': { mime: 'application/x-mswrite', convertTo: 'wri', type: 'document' },
  'wps': { mime: 'application/vnd.ms-works', convertTo: 'wps', type: 'document' },
  'wri': { mime: 'application/x-mswrite', convertTo: 'wri', type: 'document' }
};

// LibreOffice 변환 옵션 매핑
const LIBREOFFICE_OPTIONS = {
  // 문서 형식
  'odt': 'odt',
  'fodt': 'fodt',
  'doc': 'doc',
  'docx': 'docx',
  'rtf': 'rtf',
  'txt': 'txt',
  'html': 'html',
  'xhtml': 'xhtml',
  'pdf': 'pdf',
  'epub': 'epub',
  // 스프레드시트
  'ods': 'ods',
  'fods': 'fods',
  'xls': 'xls',
  'xlsx': 'xlsx',
  'xlsm': 'xlsm',
  'xltx': 'xltx',
  'xlsb': 'xlsb',
  'csv': 'csv',
  'tsv': 'tsv',
  'dif': 'dif',
  'dbf': 'dbf',
  // 프레젠테이션
  'odp': 'odp',
  'fodp': 'fodp',
  'ppt': 'ppt',
  'pptx': 'pptx',
  'potx': 'potx',
  'ppsx': 'ppsx',
  'pptm': 'pptm',
  'potm': 'potm',
  'ppsm': 'ppsm',
  // 드로잉
  'odg': 'odg',
  'fodg': 'fodg',
  'svg': 'svg',
  'wmf': 'wmf',
  'emf': 'emf',
  'vsd': 'vsd',
  'vdx': 'vdx',
  'vsdm': 'vsdm',
  'vsdx': 'vsdx',
  'cdr': 'cdr',
  'cmx': 'cmx',
  'pub': 'pub',
  // 이미지
  'png': 'png',
  'jpg': 'jpg',
  'jpeg': 'jpg',
  'gif': 'gif',
  'bmp': 'bmp',
  'tif': 'tif',
  'tiff': 'tiff',
  'pct': 'pct',
  'pbm': 'pbm',
  'pcd': 'pcd',
  'pcx': 'pcx',
  'pgm': 'pgm',
  'ppm': 'ppm',
  'ras': 'ras',
  'xbm': 'xbm',
  'xpm': 'xpm',
  // 기타
  'json': 'json',
  'xml': 'xml',
  'zip': 'zip'
};

// 파일 형식별 변환 호환성 그룹
const CONVERSION_GROUPS = {
  'document': ['odt', 'doc', 'docx', 'rtf', 'txt', 'html', 'xhtml', 'pdf', 'epub'],
  'spreadsheet': ['ods', 'xls', 'xlsx', 'csv', 'tsv', 'dif', 'dbf', 'pdf'],
  'presentation': ['odp', 'ppt', 'pptx', 'pdf', 'swf', 'html'],
  'drawing': ['odg', 'svg', 'emf', 'wmf', 'pdf', 'png', 'jpg'],
  'image': ['png', 'jpg', 'gif', 'bmp', 'tif', 'svg', 'pdf'],
  'text': ['txt', 'html', 'pdf', 'odt', 'docx']
};

// MIME 타입 기반 파일 형식 감지
const MIME_TO_EXTENSION = {};
Object.entries(SUPPORTED_FORMATS).forEach(([ext, info]) => {
  if (!MIME_TO_EXTENSION[info.mime]) {
    MIME_TO_EXTENSION[info.mime] = ext;
  }
});

// 파일 형식 유효성 검사 및 변환 가능한 형식 확인
function validateConversion(sourceExt, targetExt) {
  if (!SUPPORTED_FORMATS[sourceExt]) {
    throw new Error(`지원하지 않는 소스 파일 형식입니다: .${sourceExt}`);
  }
  
  if (!SUPPORTED_FORMATS[targetExt]) {
    throw new Error(`지원하지 않는 대상 파일 형식입니다: .${targetExt}`);
  }
  
  const sourceType = SUPPORTED_FORMATS[sourceExt].type;
  const targetType = SUPPORTED_FORMATS[targetExt].type;
  
  // 동일한 유형 내에서만 변환 허용 (예: 문서 → 문서, 스프레드시트 → 스프레드시트)
  if (sourceType !== targetType && !CONVERSION_GROUPS[sourceType]?.includes(targetExt)) {
    const allowedTargets = CONVERSION_GROUPS[sourceType]?.join(', ') || '없음';
    throw new Error(`변환할 수 없는 형식 조합입니다. ${sourceExt}에서 변환 가능한 형식: ${allowedTargets}`);
  }
  
  return true;
}

// LibreOffice 변환 명령어 생성
function getConversionCommand(inputFile, outputFormat, outputDir = '/tmp') {
  const formatOption = LIBREOFFICE_OPTIONS[outputFormat];
  if (!formatOption) {
    throw new Error(`지원하지 않는 출력 형식입니다: ${outputFormat}`);
  }
  
  // 특수한 변환 옵션이 필요한 경우 여기서 처리
  let options = '';
  
  // PDF 변환 시 추가 옵션
  if (outputFormat === 'pdf') {
    options = '--convert-to pdf:writer_pdf_Export';
  } 
  // 이미지 변환 시 품질 옵션 추가
  else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff'].includes(outputFormat)) {
    options = `--convert-to ${formatOption} --outdir ${outputDir} --headless --norestore`;
  }
  // 일반 문서 변환
  else {
    options = `--convert-to ${formatOption}:writer8`; // 기본 변환 필터
  }
  
  return `libreoffice --headless ${options} ${inputFile}`;
}

// 파일 확장자 추출 (확장자가 없는 경우 MIME 타입으로부터 추정)
function getFileExtension(filename, mimeType) {
  let ext = path.extname(filename).toLowerCase().replace('.', '');
  
  // 확장자가 없거나 지원하지 않는 경우 MIME 타입으로부터 추정
  if (!ext || !SUPPORTED_FORMATS[ext]) {
    ext = MIME_TO_EXTENSION[mimeType] || '';
  }
  
  return ext || 'bin'; // 기본값: bin
}

module.exports = async function(context, blob) {
  try {
    // 1) 메타데이터에서 파일 정보 가져오기
    const fileName = context.bindingData.name || `file_${Date.now()}`;
    const fileExt = getFileExtension(fileName, context.bindingData.properties?.contentType || '');
    
    // 2) 변환 형식 결정 (기본값: PDF)
    let targetFormat = (context.bindingData.properties?.targetFormat || 'pdf').toLowerCase();
    
    // URL 매개변수에서 targetFormat 확인 (예: ?format=pdf)
    if (context.req?.query?.format) {
      targetFormat = context.req.query.format.toLowerCase();
    }
    
    // 변환 가능한 형식인지 검증
    validateConversion(fileExt, targetFormat);
    
    // 3) 원본 파일 임시 저장
    const fileId = uuid();
    const inFile = `/tmp/${fileId}.${fileExt}`;
    const outFileBase = `/tmp/${fileId}`;
    const outFile = `${outFileBase}.${targetFormat}`;
    
    await fs.writeFile(inFile, blob);
    
    // 4) LibreOffice로 변환
    try {
      const command = getConversionCommand(inFile, targetFormat, '/tmp');
      context.log(`실행 명령어: ${command}`);
      
      execSync(command, { stdio: 'pipe' });
      
      // 변환된 파일이 제대로 생성되었는지 확인
      try {
        await fs.access(outFile);
      } catch (err) {
        // 원본 파일명에 확장자가 없을 수 있으므로, 파일명을 확인해봅니다.
        const dirFiles = await fs.readdir('/tmp');
        const convertedFile = dirFiles.find(f => f.startsWith(fileId) && !f.endsWith(fileExt));
        
        if (convertedFile) {
          // 변환된 파일을 올바른 경로로 이동
          await fs.rename(`/tmp/${convertedFile}`, outFile);
        } else {
          throw new Error(`변환된 파일을 찾을 수 없습니다. 원본 형식: ${fileExt}, 대상 형식: ${targetFormat}`);
        }
      }
    } catch (error) {
      context.log(`변환 오류: ${error.message}`);
      throw new Error(`파일 변환 중 오류가 발생했습니다: ${error.message}`);
    }

    // 5) Cloudflare R2 클라이언트 초기화
    const s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY
      }
    });

    // 6) 변환된 파일 읽기
    const convertedFile = await fs.readFile(outFile);
    const outputFileName = `${fileId}.${targetFormat}`;
    const mimeType = SUPPORTED_FORMATS[targetFormat]?.mime || 'application/octet-stream';
    
    // 7) 변환된 파일 업로드
    await s3.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: outputFileName,
      Body: convertedFile,
      ContentType: mimeType,
      Metadata: { 
        ttl: process.env.FILE_TTL || "3600",  // 기본 1시간 TTL
        originalName: fileName,
        convertedFrom: fileExt,
        convertedTo: targetFormat,
        conversionTime: new Date().toISOString()
      }
    }));
    
    // 8) 임시 파일 정리
    try {
      await Promise.all([
        fs.unlink(inFile).catch(() => {}),
        fs.unlink(outFile).catch(() => {})
      ]);
    } catch (cleanupError) {
      context.log(`임시 파일 정리 중 오류: ${cleanupError.message}`);
      // 임시 파일 정리 실패는 무시하고 계속 진행
    }
    
    context.log(`✅ 변환 완료: ${fileName} (${fileExt}) → ${outputFileName} (${targetFormat})`);
    
    // 9) 결과 반환
    const result = {
      success: true,
      originalFile: fileName,
      originalFormat: fileExt,
      convertedFile: outputFileName,
      convertedFormat: targetFormat,
      mimeType: mimeType,
      size: convertedFile.length,
      url: `${process.env.R2_PUBLIC_URL || ''}/${outputFileName}`,
      timestamp: new Date().toISOString()
    };
    
    return result;
    
  } catch (error) {
    context.log(`❌ 오류 발생: ${error.message}`, error.stack);
    
    // 상세한 오류 메시지 생성
    const errorResponse = {
      success: false,
      error: error.message,
      code: error.code || 'CONVERSION_ERROR',
      timestamp: new Date().toISOString()
    };
    
    // HTTP 응답이 필요한 경우
    if (context.res) {
      context.res = {
        status: 500,
        body: errorResponse,
        headers: {
          'Content-Type': 'application/json'
        }
      };
    }
    
    throw error;
  }
};