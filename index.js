const path = require("path");
const { generateWorkflowProject, loadWorkflowFile, previewWorkflowExport } = require("./lib/workflow");

function printUsage() {
  console.log("Workflow Studio CLI");
  console.log("");
  console.log("用法:");
  console.log("  node index.js export --workflow <path-to-.fengflow.json> --output <dir>");
  console.log("");
  console.log("说明:");
  console.log("  - CLI 现在只负责读取 WorkflowDocument 并导出项目");
  console.log("  - 建议先在桌面端完成流程编辑，再导出 .fengflow.json");
}

function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) {
    return "";
  }
  return args[index + 1] || "";
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command !== "export") {
    throw new Error("CLI 只支持 `export` 命令。");
  }

  const workflowPath = getArgValue(args, "--workflow");
  const outputDir = getArgValue(args, "--output");

  if (!workflowPath) {
    throw new Error("缺少 `--workflow <path>` 参数。");
  }

  if (!outputDir) {
    throw new Error("缺少 `--output <dir>` 参数。");
  }

  const workflow = loadWorkflowFile(path.resolve(workflowPath));
  const preview = previewWorkflowExport(workflow, {
    outputDir: path.resolve(outputDir),
  });

  if (!preview.canGenerate) {
    const blockers = (preview.diagnostics.items || [])
      .filter((item) => item.level === "blocker")
      .map((item, index) => `${index + 1}. ${item.message}`)
      .join("\n");
    throw new Error(`流程还有阻塞项，不能导出：\n${blockers}`);
  }

  const result = generateWorkflowProject(workflow, {
    outputDir: path.resolve(outputDir),
  });

  console.log("导出成功");
  console.log(`输出目录: ${result.outputDir}`);
  console.log(`文件数: ${result.files.length}`);
  console.log("下一步:");
  console.log(`1. 进入目录: ${result.outputDir}`);
  console.log("2. 运行: npm install");
  console.log("3. 双击: 0-双击-运行前检查.bat");
  console.log("4. 双击: 2-双击-启动脚本.bat");
}

try {
  main();
} catch (error) {
  console.error(`执行失败: ${error.message || String(error)}`);
  process.exit(1);
}
