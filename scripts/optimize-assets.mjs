/**
 * Offline, decoder-free simplification of the original Renda GLTF scans.
 *
 * npm install --prefix /tmp/renda-asset-tools --no-save \
 *   @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 \
 *   @gltf-transform/extensions@4.5.1 meshoptimizer@1.3.0
 * ASSET_TOOLS_DIR=/tmp/renda-asset-tools node scripts/optimize-assets.mjs \
 *   --source /path/to/untouched-export --output /path/to/project
 *
 * Source and output must differ: every run starts with the original geometry.
 * Textures are verified byte-for-byte and are never rewritten. Only GLTF JSON
 * and external geometry buffers are emitted. No runtime compression is added.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const sourceRoot = path.resolve(option('--source', ''));
const outputRoot = path.resolve(option('--output', '.'));
if (!option('--source') || sourceRoot === outputRoot) {
  throw new Error('Pass --source pointing to a separate, untouched project export.');
}
const toolingRoot = path.resolve(process.env.ASSET_TOOLS_DIR || '/tmp/renda-asset-tools');
const requireTool = createRequire(path.join(toolingRoot, 'package.json'));
const importTool = (name) => import(pathToFileURL(requireTool.resolve(name)).href);
const [{ NodeIO }, { ALL_EXTENSIONS }, { simplifyPrimitive, weldPrimitive, getBounds }, { MeshoptSimplifier }] =
  await Promise.all([
    importTool('@gltf-transform/core'),
    importTool('@gltf-transform/extensions'),
    importTool('@gltf-transform/functions'),
    importTool('meshoptimizer'),
  ]);
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const ERROR_LIMIT = 0.002; // Default geometric error: 0.2% of mesh radius.
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function findGltfs(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await findGltfs(filename));
    else if (filename.endsWith('.gltf')) files.push(filename);
  }
  return files.sort();
}
const triangleCount = (prim) => Math.floor((prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3);
const primitiveList = (doc) => doc.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
const countTriangles = (doc) => primitiveList(doc).reduce((sum, prim) => sum + triangleCount(prim), 0);
const geometryBytes = (json) => json.buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);

function triangleBudget(relative, triangles) {
  if (relative.includes('/props/')) return 6000;
  // Keep more silhouette detail on these two large, irregular scans.
  if (relative.includes('/shrub_01/')) return 12000;
  if (relative.includes('/dead_tree_trunk/')) return 10000;
  if (/\/(grass_medium_0[12]|dandelion_01|celandine_01|periwinkle_plant|nettle_plant|weed_plant_02|fern_02)\//.test(relative)) {
    return 2000;
  }
  return 4000;
}

function errorLimit(relative) {
  // These heavily tessellated scans need a little more geometric freedom.
  // The bound remains below 1% of radius, and texture alpha remains untouched.
  if (/\/(dandelion_01|grass_medium_01|periwinkle_plant|tree_stump_01|wicker_basket_01)\//.test(relative)) return 0.006;
  if (/\/(rock_07|rock_moss_set_01)\//.test(relative)) return 0.004;
  return ERROR_LIMIT;
}

const files = [
  ...await findGltfs(path.join(sourceRoot, 'public/assets/foliage')),
  ...await findGltfs(path.join(sourceRoot, 'public/assets/props')),
].sort();
const report = {
  toolVersions: { gltfTransform: '4.5.1', meshoptimizer: '1.3.0' },
  algorithm: 'Weld identical vertices, geometric-error-bounded indexed simplification, compact vertex attributes.',
  defaultRelativeError: ERROR_LIMIT,
  maximumRelativeError: 0.006,
  policy: 'Preserve all primitives below 2000 triangles, material assignments, texture bytes/URIs, node transforms, mesh names, normals, UVs and alpha settings. No mesh joins, texture compression, quantization or runtime decoder extensions.',
  files: [],
};

for (const source of files) {
  const relative = path.relative(sourceRoot, source).split(path.sep).join('/');
  const originalJson = JSON.parse(await readFile(source, 'utf8'));
  const doc = await io.read(source);
  const originalExport = await io.writeJSON(doc);
  const beforeTriangles = countTriangles(doc);
  const beforeBounds = doc.getRoot().listScenes().map((scene) => getBounds(scene));
  const beforeSemantics = primitiveList(doc).map((prim) => prim.listSemantics().slice().sort());
  const relativeError = errorLimit(relative);
  const rows = [];

  for (const [index, prim] of primitiveList(doc).entries()) {
    const before = triangleCount(prim);
    const target = triangleBudget(relative, before);
    if (before >= 2000 && before > target && prim.getMode() === 4) {
      weldPrimitive(prim);
      simplifyPrimitive(prim, {
        simplifier: MeshoptSimplifier,
        ratio: target / triangleCount(prim),
        error: relativeError,
        lockBorder: false,
      });
    }
    rows.push({ index, before, after: triangleCount(prim), target });
  }

  const afterTriangles = countTriangles(doc);
  const exported = await io.writeJSON(doc);
  const afterBounds = doc.getRoot().listScenes().map((scene) => getBounds(scene));
  // Writer-normalized JSON gives exact semantic comparisons despite source
  // defaults being omitted or serialized differently by the original exporter.
  for (const key of ['materials', 'images', 'textures', 'samplers', 'nodes', 'scenes', 'extensions', 'extensionsUsed', 'extensionsRequired']) {
    if (!equal(originalExport.json[key], exported.json[key])) {
      throw new Error(`${relative}: simplification unexpectedly changed ${key}`);
    }
  }
  if (!equal(beforeSemantics, primitiveList(doc).map((prim) => prim.listSemantics().slice().sort()))) {
    throw new Error(`${relative}: vertex attribute semantics changed`);
  }
  let boundsDelta = 0;
  for (let i = 0; i < beforeBounds.length; i++) {
    const bounds = beforeBounds[i];
    const radius = Math.hypot(...bounds.max.map((value, axis) => value - bounds.min[axis])) / 2;
    for (const side of ['min', 'max']) {
      for (let axis = 0; axis < 3; axis++) {
        const delta = Math.abs(bounds[side][axis] - afterBounds[i][side][axis]);
        boundsDelta = Math.max(boundsDelta, delta);
        if (!Number.isFinite(delta) || delta > Math.max(0.002, radius * 0.01)) {
          throw new Error(`${relative}: bounds moved beyond 1% of radius`);
        }
      }
    }
  }
  for (const prim of primitiveList(doc)) {
    const count = prim.getAttribute('POSITION').getCount();
    for (const index of prim.getIndices()?.getArray() ?? []) {
      if (index >= count) throw new Error(`${relative}: invalid vertex index`);
    }
    for (const attribute of prim.listAttributes()) {
      if (attribute.getCount() !== count) throw new Error(`${relative}: attribute count mismatch`);
      for (const value of attribute.getArray()) {
        if (!Number.isFinite(value)) throw new Error(`${relative}: non-finite attribute`);
      }
    }
  }
  for (const image of originalJson.images ?? []) {
    if (!image.uri || image.uri.startsWith('data:')) continue;
    const originalTexture = await readFile(path.resolve(path.dirname(source), image.uri));
    const exportedTexture = exported.resources[image.uri];
    if (!exportedTexture || sha256(originalTexture) !== sha256(exportedTexture)) {
      throw new Error(`${relative}: texture changed or URI was renamed: ${image.uri}`);
    }
  }

  const changed = afterTriangles < beforeTriangles;
  const entry = {
    path: relative,
    changed,
    trianglesBefore: beforeTriangles,
    trianglesAfter: afterTriangles,
    geometryBytesBefore: geometryBytes(originalJson),
    geometryBytesAfter: changed ? geometryBytes(exported.json) : geometryBytes(originalJson),
    materialCount: doc.getRoot().listMaterials().length,
    primitiveCount: rows.length,
    maximumBoundsDelta: boundsDelta,
    relativeErrorLimit: relativeError,
    boundsBefore: beforeBounds,
    boundsAfter: afterBounds,
    primitives: rows,
  };
  if (changed) {
    const dest = path.join(outputRoot, relative);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, JSON.stringify(exported.json, null, 2) + '\n');
    // Only geometry is written, so artist-provided textures remain untouched.
    for (const buffer of exported.json.buffers) {
      if (!originalJson.buffers.some((original) => original.uri === buffer.uri)) {
        throw new Error(`${relative}: geometry buffer URI changed`);
      }
      await writeFile(path.resolve(path.dirname(dest), buffer.uri), exported.resources[buffer.uri]);
    }
    // Reopen the emitted file, including its original on-disk texture references.
    const reloaded = await io.read(dest);
    if (countTriangles(reloaded) !== afterTriangles || reloaded.getRoot().listMaterials().length !== entry.materialCount) {
      throw new Error(`${relative}: written GLTF failed roundtrip validation`);
    }
  }
  report.files.push(entry);
  console.log(`${changed ? 'optimized' : 'preserved'} ${relative}: ${beforeTriangles} -> ${afterTriangles} triangles`);
}

report.summary = {
  fileCount: report.files.length,
  optimizedFileCount: report.files.filter((file) => file.changed).length,
  trianglesBefore: report.files.reduce((sum, file) => sum + file.trianglesBefore, 0),
  trianglesAfter: report.files.reduce((sum, file) => sum + file.trianglesAfter, 0),
  geometryBytesBefore: report.files.reduce((sum, file) => sum + file.geometryBytesBefore, 0),
  geometryBytesAfter: report.files.reduce((sum, file) => sum + file.geometryBytesAfter, 0),
};
await mkdir(path.join(outputRoot, 'docs'), { recursive: true });
await writeFile(path.join(outputRoot, 'docs/asset-optimization.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report.summary, null, 2));
