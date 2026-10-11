const {isDeepStrictEqual}=require('node:util');
const {versionMap,mapToDocument,mapSummary,mapResourceFromDocument}=require('./game-runtime.cjs');

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
function publishMapResource(existing,raw,content) {
  if(existing && (existing.id!==raw.id||existing.chapterId!==raw.chapterId||existing.orderInChapter!==raw.orderInChapter))throw new Error('MAP_IDENTITY_CHANGED');
  const previous=existing?.versions.find(entry=>entry.mapVersion===existing.latestVersion);
  if(existing&&!previous)throw new Error('INVALID_MAP_RESOURCE');
  const nextVersion=existing?Math.max(...existing.versions.map(m=>m.mapVersion))+1:raw.mapVersion??raw.contentVersion;
  const map=versionMap(raw,content,raw.mapVersion??(previous?nextVersion:raw.contentVersion));
  const encoded=mapToDocument(map);
  if(previous&&raw.mapVersion===undefined&&isDeepStrictEqual(payload(previous),payload(encoded))) {
    mapResourceFromDocument(existing,content);
    return checkSize(existing);
  }
  const same=existing?.versions.find(m=>m.mapVersion===map.mapVersion);
  if(same&&!isDeepStrictEqual(same,encoded))throw new Error(`IMMUTABLE_MAP_VERSION: ${raw.id}/${map.mapVersion}`);
  if(existing&&!same&&map.mapVersion<=Math.max(...existing.versions.map(m=>m.mapVersion)))throw new Error('MAP_VERSION_NOT_INCREASING');
  const resource={id:map.id,chapterId:map.chapterId,orderInChapter:map.orderInChapter,latestVersion:map.mapVersion,
    latestSummary:mapSummary(map),versions:same?existing.versions:[...(existing?.versions??[]),encoded]};
  mapResourceFromDocument(resource,content);
  return checkSize(resource);
}
module.exports={publishMapResource,checkSize,MAX_RESOURCE_BYTES};
