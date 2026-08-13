#!/usr/bin/env node
// imgstamp-xw CLI:imgstamp-xw <embed|extract|verify> ...

import { embedMany, extractStamp, verify } from "./index.js";

const HELP = `imgstamp-xw: 在图片文件头无损添加自定义字符串标记(PNG / JPEG / GIF)

用法:
  imgstamp-xw embed STAMP PATH... [-o DIR]   写入标记(默认原地修改,-o 输出到目录)
  imgstamp-xw extract PATH                    提取图片中的标记
  imgstamp-xw verify PATH STAMP               校验标记是否存在且一致
  imgstamp-xw help                            显示本帮助`;

function cmdEmbed(argv) {
  let outputDir;
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--output-dir") {
      if (i + 1 >= argv.length) {
        console.error("错误: -o/--output-dir 需要一个目录参数");
        return 2;
      }
      outputDir = argv[++i];
    } else {
      positionals.push(arg);
    }
  }
  if (positionals.length < 2) {
    console.error("用法: imgstamp-xw embed STAMP PATH... [-o DIR]");
    return 2;
  }
  const [stamp, ...paths] = positionals;
  let failures = 0;
  for (const p of paths) {
    try {
      embedMany([p], stamp, { outputDir });
    } catch (err) {
      console.error(`跳过 ${p}: ${err.message}`);
      failures++;
    }
  }
  const ok = paths.length - failures;
  let msg = `已标记 ${ok} 个文件`;
  if (outputDir) msg += `, 输出到 ${outputDir}`;
  if (failures) {
    msg += `, 失败 ${failures} 个`;
    console.error(msg);
    return 2;
  }
  console.log(msg);
  return 0;
}

function cmdExtract(argv) {
  if (argv.length !== 1) {
    console.error("用法: imgstamp-xw extract PATH");
    return 2;
  }
  const stamp = extractStamp(argv[0]);
  if (stamp === null) {
    console.error(`${argv[0]}: 未找到标记`);
    return 1;
  }
  console.log(stamp);
  return 0;
}

function cmdVerify(argv) {
  if (argv.length !== 2) {
    console.error("用法: imgstamp-xw verify PATH STAMP");
    return 2;
  }
  if (verify(argv[0], argv[1])) {
    console.log("OK: 标记一致");
    return 0;
  }
  console.error("FAIL: 标记不存在或不一致");
  return 1;
}

function main(argv) {
  const [command, ...rest] = argv;
  switch (command) {
    case "embed":
      return cmdEmbed(rest);
    case "extract":
      return cmdExtract(rest);
    case "verify":
      return cmdVerify(rest);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return command === undefined ? 2 : 0;
    default:
      console.error(`未知命令: ${command}`);
      console.log(HELP);
      return 2;
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  console.error(`错误: ${err.message}`);
  process.exitCode = 2;
}
