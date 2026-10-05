const fs = require("fs");
const path = require("path");

if (typeof TextDecoder === "undefined") {
  global.TextDecoder = require("util").TextDecoder;
}

if (typeof TextEncoder === "undefined") {
  global.TextEncoder = require("util").TextEncoder;
}

const CFB = require("cfb");
const JSZip = require("jszip");
const XLSX = require("xlsx");
const { askDeepSeek } = require("./deepseek");

const AI_XLSM_CONFIG_FILE = "ai-xlsm-config.json";

function printUsage() {
  console.log("Usage:");
  console.log("  node update-doc.js [xlsxFile]");
  console.log("  node update-doc.js [xlsxFile] [docTemplateFile]");
  console.log("  node update-doc.js [xlsxFile] [docTemplateFile] [docOutputFile]");
  console.log("");
  console.log("Examples:");
  console.log("  node update-doc.js test.xlsm");
  console.log("  node update-doc.js test.xlsm template-test.doc");
  console.log("  node update-doc.js test.xlsm template-test.doc output.doc");
}

function resolveFromCurrentDirectory(filePath) {
  return path.resolve(process.cwd(), filePath);
}

function worksheetToCellMap(worksheet) {
  const cells = {};

  if (!worksheet["!ref"]) {
    return cells;
  }

  const range = XLSX.utils.decode_range(worksheet["!ref"]);

  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
      const cellAddress = XLSX.utils.encode_cell({
        r: rowIndex,
        c: columnIndex
      });
      const cell = worksheet[cellAddress];

      cells[cellAddress] = cell ? XLSX.utils.format_cell(cell).trim() : null;
    }
  }

  return cells;
}

function readWorkbookAsJson(xlsxPath) {
  const workbook = XLSX.readFile(xlsxPath, {
    cellDates: true
  });

  const sheets = {};

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];

    sheets[sheetName] = worksheetToCellMap(worksheet);
  }

  return {
    file: path.basename(xlsxPath),
    sheetNames: workbook.SheetNames,
    sheets
  };
}

function writeJsonFile(outputPath, data) {
  const outputDirectory = path.dirname(outputPath);

  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf8");
}

function createJsonOutputPath(inputPath) {
  return path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}.json`
  );
}

function createDocumentOutputPath(templatePath) {
  const extension = path.extname(templatePath);
  const basename = path.basename(templatePath, extension);

  return path.join(path.dirname(templatePath), `${basename}-updated${extension}`);
}

function createDeepSeekDebugOutputPath(inputPath) {
  return path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}-deepseek-results.json`
  );
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeXmlTextWithLineBreaks(value) {
  return String(value)
    .split(/\r\n|\n|\r/)
    .map((line) => escapeXml(line))
    .join("</w:t><w:br/><w:t>");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isNonEmptyValue(value) {
  return value !== null && typeof value !== "undefined" && String(value).trim() !== "";
}

function compareValues(leftValue, condition, rightValue) {
  const left = String(leftValue);
  const right = String(rightValue);

  switch (condition) {
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case "==":
      return left == right;
    case "!=":
      return left != right;
    case "includes":
      return left.includes(right);
    case "notIncludes":
      return !left.includes(right);
    default:
      throw new Error(`Unsupported condition in ${AI_XLSM_CONFIG_FILE}: ${condition}`);
  }
}

function getCellValue(data, sheetName, cellAddress) {
  const sheet = data.xlsx.sheets[sheetName];
  const normalizedCellAddress = cellAddress.toUpperCase();

  if (!sheet || !Object.prototype.hasOwnProperty.call(sheet, normalizedCellAddress)) {
    return null;
  }

  const value = sheet[normalizedCellAddress];

  return value === null || typeof value === "undefined" ? null : String(value);
}

function replaceTemplateMarkersInText(text, data, options = {}) {
  let replacementCount = 0;
  const markerPatterns = [
    /\{?```([^`{}]+)\/([A-Za-z]+[0-9]+)```\}?/g,
    /\{([^{}]+)\/([A-Za-z]+[0-9]+)\}/g
  ];

  let result = text;

  for (const markerPattern of markerPatterns) {
    result = result.replace(markerPattern, (marker, sheetName, cellAddress) => {
      const value = getCellValue(data, sheetName, cellAddress);

      if (value === null) {
        return marker;
      }

      replacementCount += 1;
      if (!options.escapeXml) {
        return value;
      }

      return options.preserveLineBreaks ? escapeXmlTextWithLineBreaks(value) : escapeXml(value);
    });
  }

  if (Array.isArray(data.textReplacements)) {
    for (const replacement of data.textReplacements) {
      if (!replacement || !replacement.marker || !isNonEmptyValue(replacement.value)) {
        continue;
      }

      const replacementPattern = new RegExp(escapeRegExp(replacement.marker), "g");
      let value = String(replacement.value);

      if (options.escapeXml) {
        value = options.preserveLineBreaks
          ? escapeXmlTextWithLineBreaks(value)
          : escapeXml(value);
      }

      result = result.replace(replacementPattern, () => {
        replacementCount += 1;
        return value;
      });
    }
  }

  return {
    text: result,
    replacementCount
  };
}

async function updateDocxTemplate(templatePath, outputPath, data) {
  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath));
  let replacementCount = 0;
  const wordXmlFiles = Object.keys(zip.files).filter((fileName) => {
    return fileName.startsWith("word/") && fileName.endsWith(".xml");
  });

  for (const fileName of wordXmlFiles) {
    const file = zip.file(fileName);

    if (!file) {
      continue;
    }

    const xml = await file.async("string");
    const replaced = replaceTemplateMarkersInText(xml, data);

    if (replaced.replacementCount > 0) {
      zip.file(fileName, replaceTemplateMarkersInText(xml, data, {
        escapeXml: true,
        preserveLineBreaks: true
      }).text);
      replacementCount += replaced.replacementCount;
    }
  }

  const outputDirectory = path.dirname(outputPath);

  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  fs.writeFileSync(outputPath, await zip.generateAsync({ type: "nodebuffer" }));

  return replacementCount;
}

function updateBinaryDocTemplate(templatePath, outputPath, data) {
  const cfb = CFB.read(fs.readFileSync(templatePath), { type: "buffer" });
  const wordDocument = cfb.FileIndex.find((file) => file.name === "WordDocument");

  if (!wordDocument || !wordDocument.content) {
    throw new Error(`DOC file does not contain a WordDocument stream: ${templatePath}`);
  }

  const originalText = Buffer.from(wordDocument.content).toString("utf16le");
  let replacementCount = 0;
  let skippedLongValueCount = 0;
  let fixedLengthText = originalText.replace(
    /\{?```([^`{}]+)\/([A-Za-z]+[0-9]+)```\}?|\{([^{}]+)\/([A-Za-z]+[0-9]+)\}/g,
    (marker, backtickSheetName, backtickCellAddress, braceSheetName, braceCellAddress) => {
      const sheetName = backtickSheetName || braceSheetName;
      const cellAddress = backtickCellAddress || braceCellAddress;
      const value = getCellValue(data, sheetName, cellAddress);

      if (value === null) {
        return marker;
      }

      const markerLength = Buffer.byteLength(marker, "utf16le");
      const valueLength = Buffer.byteLength(value, "utf16le");

      if (valueLength > markerLength) {
        skippedLongValueCount += 1;
        return marker;
      }

      replacementCount += 1;
      return value + "\u0000".repeat((markerLength - valueLength) / 2);
    }
  );

  if (Array.isArray(data.textReplacements)) {
    for (const replacement of data.textReplacements) {
      if (!replacement || !replacement.marker || !isNonEmptyValue(replacement.value)) {
        continue;
      }

      const replacementPattern = new RegExp(escapeRegExp(replacement.marker), "g");

      fixedLengthText = fixedLengthText.replace(replacementPattern, (marker) => {
        const value = String(replacement.value);
        const markerLength = Buffer.byteLength(marker, "utf16le");
        const valueLength = Buffer.byteLength(value, "utf16le");

        if (valueLength > markerLength) {
          skippedLongValueCount += 1;
          return marker;
        }

        replacementCount += 1;
        return value + "\u0000".repeat((markerLength - valueLength) / 2);
      });
    }
  }

  wordDocument.content = Buffer.from(fixedLengthText, "utf16le");

  const outputDirectory = path.dirname(outputPath);

  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  fs.writeFileSync(outputPath, CFB.write(cfb, { type: "buffer" }));

  return {
    replacementCount,
    skippedLongValueCount
  };
}

function isZipDocument(filePath) {
  const signature = Buffer.alloc(4);
  const fileDescriptor = fs.openSync(filePath, "r");

  try {
    fs.readSync(fileDescriptor, signature, 0, 4, 0);
  } finally {
    fs.closeSync(fileDescriptor);
  }

  return signature[0] === 0x50 && signature[1] === 0x4b;
}

async function updateDocumentTemplate(templatePath, outputPath, data) {
  if (isZipDocument(templatePath)) {
    const replacementCount = await updateDocxTemplate(templatePath, outputPath, data);

    return {
      replacementCount,
      skippedLongValueCount: 0
    };
  }

  return updateBinaryDocTemplate(templatePath, outputPath, data);
}

function readAiXlsmConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function findDeepSeekPromptRows(data, config) {
  if (
    !config.tabName ||
    !config.targetColumn ||
    !config.reference ||
    !config.condition ||
    typeof config.targetColumnValue === "undefined"
  ) {
    console.log(`Skipping DeepSeek because ${AI_XLSM_CONFIG_FILE} is missing required fields`);
    return [];
  }

  const sheet = data.xlsx.sheets[config.tabName];

  if (!sheet) {
    console.log(`Skipping DeepSeek because sheet was not found: ${config.tabName}`);
    return [];
  }

  const targetColumn = String(config.targetColumn || "").toUpperCase();
  const referenceColumn = String(config.reference || "").toUpperCase();
  const rows = [];

  for (const cellAddress of Object.keys(sheet)) {
    const match = cellAddress.match(/^([A-Z]+)([0-9]+)$/);

    if (!match || match[1] !== targetColumn) {
      continue;
    }

    const rowNumber = match[2];
    const targetValue = sheet[cellAddress];
    const referenceValue = sheet[`${referenceColumn}${rowNumber}`];

    if (
      isNonEmptyValue(targetValue) &&
      isNonEmptyValue(referenceValue) &&
      compareValues(targetValue, config.condition, config.targetColumnValue)
    ) {
      rows.push({
        rowNumber,
        targetCell: `${targetColumn}${rowNumber}`,
        targetValue: String(targetValue),
        referenceCell: `${referenceColumn}${rowNumber}`,
        referenceValue: String(referenceValue),
        prompt: `${config.deepseekPrompt}\n${referenceValue}`
      });
    }
  }

  rows.sort((left, right) => Number(left.rowNumber) - Number(right.rowNumber));

  return rows;
}

async function createDeepSeekTextReplacement(data, config) {
  if (!config || !config.replacePoint || !config.deepseekPrompt) {
    return null;
  }

  const rows = findDeepSeekPromptRows(data, config);

  if (rows.length === 0) {
    console.log(`No DeepSeek prompt rows matched ${AI_XLSM_CONFIG_FILE}`);
    return null;
  }

  const replacementTexts = [];
  const debugEntries = [];

  for (const row of rows) {
    console.log(`Calling DeepSeek for row ${row.rowNumber}`);
    const answer = await askDeepSeek(row.prompt, {
      systemPrompt: "你是个人信息保护影响评估报告助手，请用中文给出专业、可落地、适合放入正式评估报告的建议。"
    });
    const trimmedAnswer = answer.trim();

    replacementTexts.push(`${row.referenceValue}\n有风险\n${trimmedAnswer}`);
    debugEntries.push({
      rowNumber: row.rowNumber,
      targetCell: row.targetCell,
      targetValue: row.targetValue,
      referenceCell: row.referenceCell,
      referenceValue: row.referenceValue,
      prompt: row.prompt,
      response: trimmedAnswer
    });
  }

  return {
    marker: config.replacePoint,
    value: `${replacementTexts.join("\n\n")}\n\n`,
    count: replacementTexts.length,
    debugEntries
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const inputFile = args[0] || "test.xlsm";
  const templateFile = args[1] || null;
  const documentOutputFile = args[2] || null;
  const inputPath = resolveFromCurrentDirectory(inputFile);
  const jsonOutputPath = createJsonOutputPath(inputPath);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Excel file was not found: ${inputPath}`);
  }

  const data = {
    xlsx: readWorkbookAsJson(inputPath)
  };

  writeJsonFile(jsonOutputPath, data);

  console.log(`Read ${data.xlsx.sheetNames.length} sheet(s) from ${inputPath}`);
  console.log(`JSON output written to ${jsonOutputPath}`);

  if (templateFile) {
    const templatePath = resolveFromCurrentDirectory(templateFile);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`DOC/DOCX template file was not found: ${templatePath}`);
    }

    const aiConfig = readAiXlsmConfig(resolveFromCurrentDirectory(AI_XLSM_CONFIG_FILE));
    const deepSeekReplacement = await createDeepSeekTextReplacement(data, aiConfig);

    if (deepSeekReplacement) {
      data.textReplacements = [deepSeekReplacement];
      console.log(`Prepared ${deepSeekReplacement.count} DeepSeek answer(s) for ${deepSeekReplacement.marker}`);
      writeJsonFile(createDeepSeekDebugOutputPath(inputPath), {
        replacePoint: deepSeekReplacement.marker,
        results: deepSeekReplacement.debugEntries
      });
      console.log(`DeepSeek debug output written to ${createDeepSeekDebugOutputPath(inputPath)}`);
    }

    const documentOutputPath = documentOutputFile
      ? resolveFromCurrentDirectory(documentOutputFile)
      : createDocumentOutputPath(templatePath);
    const result = await updateDocumentTemplate(templatePath, documentOutputPath, data);

    console.log(`Replaced ${result.replacementCount} template marker(s)`);
    if (result.skippedLongValueCount > 0) {
      console.log(`Skipped ${result.skippedLongValueCount} marker(s) because the value was too long for binary DOC in-place replacement`);
    }
    console.log(`Document output written to ${documentOutputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
