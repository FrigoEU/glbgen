import * as path from "path";
import * as fsp from "fs/promises";
import * as fs from "fs";
import { O_RDONLY } from "constants";
import { TextDecoder } from "util";

const args: string[] = process.argv.slice(2);

function readFirstLine(path: string): Promise<string> {
  return new Promise(function (resolve, reject) {
    var rs = fs.createReadStream(path, { encoding: "utf8" });
    var acc = "";
    var pos = 0;
    var index = 0;
    rs.on("data", function (chunk) {
      index = chunk.indexOf("\n");
      acc += chunk;
      index !== -1 ? rs.close() : (pos += chunk.length);
    })
      .on("close", function () {
        resolve(acc.slice(0, pos + index));
      })
      .on("error", function (err) {
        reject(err);
      });
  });
}

async function go(filePath: string) {
  try {
    await fsp.stat(filePath);
  } catch (err) {
    console.error(`Couldn't find file ${filePath}, err: ${err}, exiting.`);
    return;
  }

  // https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#binary-gltf-layout
  const fd = fs.openSync(filePath, O_RDONLY);
  const jsonLengthBuffer = new DataView(new ArrayBuffer(4));
  // First 4 bytes = glTF
  // fs.readSync(fd, jsonLengthBuffer, 0, 4, 0);
  // const gltfVersion =
  //   console.log(
  //     "first 4 bytes as utf8: " +
  //     new TextDecoder("utf-8").decode(jsonLengthBuffer)
  //   );

  // next 4 bytes = uint32 <2> = gltf version
  fs.readSync(fd, jsonLengthBuffer, 0, 4, 4);
  const gltfVersion = jsonLengthBuffer.getUint32(
    0,
    true /* little-endian! see gltf spec */
  );
  if (gltfVersion != 2) {
    console.log(".glb file is not glTF version 2");
  }

  // next 4 bytes = total length
  // next 4 bytes = json length
  fs.readSync(fd, jsonLengthBuffer, 0, 4, 12);

  const jsonLength = jsonLengthBuffer.getUint32(
    0,
    true /* little-endian, see glTF spec */
  );

  const jsonBuff = new DataView(new ArrayBuffer(jsonLength));
  fs.readSync(fd, jsonBuff, 0, jsonLength, 20);
  const jsonStr = new TextDecoder("utf-8").decode(jsonBuff);

  let jso: any;
  try {
    jso = JSON.parse(jsonStr);
  } catch (err) {
    console.error(
      `Failed to parse ${filePath} JSON entries, err: ${err}, exiting.`
    );
    return;
  }
  const json = jso;

  console.log("Parse successful.");

  const animations: { channels: unknown; name: string; samplers: unknown }[] =
    json.animations;

  const animationsTypes = animations
    .map(function (anim) {
      return `    ${anim.name}: AnimationGroup;`;
    })
    .join("\n");

  const animationsLoading = animations
    .map(function (anim) {
      return `      ${anim.name}: loaded.animationGroups.find(ac => ac.name === "${anim.name}")`;
    })
    .join(",\n");

  const parsed = path.parse(filePath);

  const template = `
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup";
import glb from "./${parsed.name}${parsed.ext}";

type Model = {
  mesh: Mesh;
  assetContainer: AssetContainer;
  animations: {
${animationsTypes}
  }
}

export async function load(scene: Scene): Promise<Model> {
  const loaded = await SceneLoader.LoadAssetContainerAsync(
    "",
    glb,
    scene,
    null,
    ".glb"
  );

  if (!loaded.meshes[0]) {
    throw new Error("No mesh found when loading ${filePath}.");
  }

  return {
    mesh: loaded.meshes[0] as Mesh,
    assetContainer: loaded,
    animations: {
${animationsLoading}
    },
  };
}
`;

  const tsFilename = path.join(parsed.dir, parsed.name + ".ts");
  try {
    await fsp.writeFile(tsFilename, template);
  } catch (err) {
    console.error(`Failed to write .ts file: ${err}`);
  }
  console.log(`Wrote file ${tsFilename}`);
}

if (
  typeof args[0] === "string" &&
  args[0].length > 0 &&
  path.parse(args[0]).ext === ".glb"
) {
  const filePath = args[0];
  console.log(`Generating typescript file for ${filePath}.`);
  go(filePath);
} else {
  console.error(
    `No valid .glb file provided as argument. Args: ${args}. Exiting. `
  );
}
