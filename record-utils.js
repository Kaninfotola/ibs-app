function formatRecordForExport(record) {
  const exportedRecord = {
    type: record.type,
    timestamp: record.timestamp
  };

  if (record.type === "food_log") {
    const foodName = record.foodName || record.text || "";
    const foodTags = Array.isArray(record.foodTags) ? record.foodTags.filter(Boolean) : [];
    if (record.speed && record.speed !== 0) exportedRecord.speed = record.speed;
    if (foodTags.length > 0) exportedRecord.tags = foodTags;
    exportedRecord.text = foodName || "";
    if (record.size && record.size !== 0) exportedRecord.size = record.size;
    if (record.risk !== undefined && record.risk !== 0) exportedRecord.risk = record.risk;
  } else if (record.type === "bm") {
    exportedRecord.tags = Array.isArray(record.tags) ? record.tags.filter(Boolean) : [];
    exportedRecord["bristol-scale"] = record.bristolScale;
    exportedRecord.evacuation = record.evacuation;
    if (record.wetness && record.wetness !== 0) exportedRecord.wetness = record.wetness;
    if (record.pressure !== undefined && record.pressure !== 0) exportedRecord.pressure = record.pressure;
  } else if (record.type === "symptoms") {
    if (record.pain && record.pain !== 0) exportedRecord.pain = record.pain;
    if (record.bloating && record.bloating !== 0) exportedRecord.bloating = record.bloating;
    if (record.nausea && record.nausea !== 0) exportedRecord.nausea = record.nausea;
  }

  return exportedRecord;
}

function normalizeImportedRecord(record) {
  if (!record || typeof record !== "object") return null;

  const type = record.type;
  const timestamp = normalizeTimestampValue(record.timestamp);
  if (!type || !timestamp) return null;

  if (type === "symptoms") {
    return {
      type,
      timestamp,
      createdAt: timestamp,
      pain: clampNumberValue(record.pain, 0, 5, 0),
      bloating: clampNumberValue(record.bloating, 0, 5, 0),
      nausea: clampNumberValue(record.nausea, 0, 5, 0)
    };
  }

  if (type === "bm") {
    return {
      type,
      timestamp,
      createdAt: timestamp,
      tags: normalizeTagListValue(record.tags),
      bristolScale: clampNumberValue(record["bristol-scale"] ?? record.bristolScale, 1, 7, 1),
      evacuation: normalizeEvacuationValue(record.evacuation),
      pressure: clampNumberValue(record.pressure, 0, 5, 0),
      wetness: clampNumberValue(record.wetness, 0, 5, 0)
    };
  }

  if (type === "food_log") {
    const foodName = normalizeTextValue(record.foodName || record.text || "", 120);
    return {
      type,
      timestamp,
      createdAt: timestamp,
      foodName,
      foodTags: Array.isArray(record.tags)
        ? normalizeTagListValue(record.tags)
        : normalizeTagListValue(record.foodTags),
      speed: clampNumberValue(record.speed, 0, 5, 0),
      size: clampNumberValue(record.size, 0, 5, 0),
      risk: clampNumberValue(record.risk, 0, 5, 0)
    };
  }

  return null;
}

function getRecordSignature(record) {
  const signatureRecord = formatRecordForExport(record);
  delete signatureRecord.createdAt;
  return JSON.stringify(signatureRecord);
}

function extractImportedRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload["ibs-records"])) return payload["ibs-records"];
  return null;
}
