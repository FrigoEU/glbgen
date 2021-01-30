import * as path from "path";
import * as fsp from "fs/promises";
import * as fs from "fs";

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
    const res = await fsp.stat(filePath);
  } catch (err) {
    console.error(`Couldn't find file ${filePath}, err: ${err}, exiting.`);
    return;
  }

  let fl: string = "";
  try {
    fl = await readFirstLine(filePath);
  } catch (err) {
    console.error(`Couldn't find file ${filePath}, err: ${err}, exiting.`);
    return;
  }
  const firstLine = fl;

  const matches = firstLine.match(/.*JSON(.*)\ /); // Not sure if this 100% fullproof :D
  if (!matches || matches.length < 2) {
    console.error("Couldn't parse ${filePath} as .glb file, exiting.");
    return;
  }

  let jso: any;
  try {
    jso = JSON.parse(matches[1]);
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
    "./${parsed.name}${parsed.ext}",
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
  console.error(`No valid .glb file provided as argument, exiting.`);
}
