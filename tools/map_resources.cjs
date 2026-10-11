const {isDeepStrictEqual}=require('node:util');
const {versionMap,mapFromDocument,mapToDocument,mapSummary,mapResourceFromDocument}=require('./game-runtime.cjs');

// Leave headroom below Firestore's 1 MiB document limit. Numeric arrays cost
// 8 bytes/value in Firestore, so JSON byte length is not a sufficient bound.
const MAX_RESOURCE_BYTES=900*1024;
function valueSize(value) {
  if(value===null||typeof value==='boolean')return 1;
  if(typeof value==='number')return 8;
  if(typeof value==='string')return Buffer.byteLength(value,'utf8')+1;
  if(Array.isArray(value))return value.reduce((sum,item)=>sum+valueSize(item),0);
  if(value&&typeof value==='object')return 32+Object.entries(value).reduce((sum,[key,item])=>sum+Buffer.byteLength(key,'utf8')+1+valueSize(item),0);
  throw new Error('INVALID_MAP_RESOURCE_VALUE');
}
function checkSize(resource) {
  const documentName=Buffer.byteLength('gameMaps','utf8')+1+Buffer.byteLength(String(resource.id),'utf8')+1+16;
  if(documentName+valueSize(resource)>MAX_RESOURCE_BYTES)throw new Error(`MAP_RESOURCE_TOO_LARGE: ${resource.id}`);
  return resource;
}
function payload(entry) {
  const {mapVersion,contentVersion,...data}=entry;
  return data;
}
function migrateLegacyMapEntry(raw, content, id) {
  if(content.version!==4)return versionMap(mapFromDocument(raw,content),content,content.version);
  // v4 authored comboPressure and allowed Collect 36. Preserve its historical
  // fields verbatim while adding the current decoder's neutral refill field.
  const tileKeys=['sword','fire','lightning','spirit','rock'];
  const tileRegistry=Object.fromEntries(tileKeys.map((key,index)=>[key,content.tiles.find(tile=>tile.key===key)?.id??index+1]));
  const spawnPolicy={...(raw.spawnPolicy??{}),comboChance:0,candidates:raw.spawnPolicy?.candidates??4};
  const map=mapFromDocument({...raw,mapVersion:content.version,rulesMode:'classic',tileRegistry,spawnPolicy},content);
  if(map.id!==id)throw new Error('INVALID_MAP_ID');
  return map;
}
function publishMapResource(existing,raw,content) {
  if(existing && (existing.id!==raw.id||existing.chapterId!==raw.chapterId||existing.orderInChapter!==raw.orderInChapter))throw new Error('MAP_IDENTITY_CHANGED');
  const previous=existing?.versions.find(entry=>entry.mapVersion===existing.latestVersion);
  if(existing&&!previous)throw new Error('INVALID_MAP_RESOURCE');
  const map=versionMap(raw,content,raw.mapVersion??(existing?Math.max(...existing.versions.map(m=>m.mapVersion))+1:raw.contentVersion));
  const encoded=mapToDocument(map);
  if(previous&&raw.mapVersion===undefined&&isDeepStrictEqual(payload(previous),payload(encoded))) {
    mapResourceFromDocument(existing,content);
    return checkSize(existing);
  }
  const same=existing?.versions.find(entry=>entry.mapVersion===map.mapVersion);
  if(same&&!isDeepStrictEqual(same,encoded))throw new Error(`IMMUTABLE_MAP_VERSION: ${raw.id}/${map.mapVersion}`);
  if(existing&&!same&&map.mapVersion<=Math.max(...existing.versions.map(m=>m.mapVersion)))throw new Error('MAP_VERSION_NOT_INCREASING');
  const resource={id:map.id,chapterId:map.chapterId,orderInChapter:map.orderInChapter,latestVersion:map.mapVersion,
    latestSummary:mapSummary(map),versions:same?existing.versions:[...(existing?.versions??[]),encoded]};
  mapResourceFromDocument(resource,content);
  return checkSize(resource);
}
function migrateMapResource(existing,entries,currentContent) {
  let resource=existing;
  for(const {map,content} of [...entries].sort((a,b)=>a.map.contentVersion-b.map.contentVersion)) {
    const revision=versionMap(map,content,map.contentVersion),encoded=mapToDocument(revision);
    const same=resource?.versions.find(m=>m.mapVersion===revision.mapVersion);
    if(same&&!isDeepStrictEqual(same,encoded))throw new Error(`IMMUTABLE_MAP_VERSION: ${map.id}/${revision.mapVersion}`);
    if(same)continue;
    if(resource&&(resource.id!==map.id||resource.chapterId!==map.chapterId||resource.orderInChapter!==map.orderInChapter))throw new Error('MAP_IDENTITY_CHANGED');
    const versions=[...(resource?.versions??[]),encoded].sort((a,b)=>a.mapVersion-b.mapVersion);
    const latest=versions.find(m=>m.mapVersion===(resource?Math.max(resource.latestVersion,revision.mapVersion):revision.mapVersion));
    const latestMap={...latest,layout:latest.layoutRows.map(row=>row.cells)};
    resource={id:map.id,chapterId:map.chapterId,orderInChapter:map.orderInChapter,latestVersion:latest.mapVersion,latestSummary:mapSummary(latestMap),versions};
  }
  if(!resource)throw new Error('MAP_NOT_FOUND');
  // Existing numeric pointers are authoritative (including intentional rollback).
  // For a fresh migration preserve the active composite catalog, not a newer draft.
  const active=resource.versions.filter(m=>m.contentVersion===currentContent.version).sort((a,b)=>b.mapVersion-a.mapVersion)[0];
  const latestVersion=existing?.latestVersion??active?.mapVersion??resource.latestVersion;
  const latest=resource.versions.find(m=>m.mapVersion===latestVersion);
  resource={...resource,latestVersion,latestSummary:mapSummary({...latest,layout:latest.layoutRows.map(row=>row.cells)})};
  mapResourceFromDocument(resource,currentContent);
  return checkSize(resource);
}
module.exports={publishMapResource,migrateMapResource,migrateLegacyMapEntry,checkSize,MAX_RESOURCE_BYTES};
