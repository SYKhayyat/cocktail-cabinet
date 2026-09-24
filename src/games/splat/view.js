import { drawText } from "../../engine.js";

function drawColumns(context, model, cameraX, offset, width) {
  model.columns.forEach((column) => {
    const x = offset + column.x - cameraX;
    if (x + column.width < offset || x > offset + width) return;
    context.fillStyle = column.passed ? "#1e293b" : "#475569";
    context.fillRect(x, column.y, column.width, column.gapY);
    context.fillRect(x, column.gapY + column.gapHeight, column.width, column.height - column.gapY - column.gapHeight);
  });
}

function drawPlayer(context, player, cameraX, offset, color) {
  const x = offset + player.x - cameraX;
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, player.y, player.radius, 0, Math.PI * 2);
  context.fill();
}

function drawDraftGap(context, model, cameraX, offset) {
  if (!model.draftGap) return;
  const x = offset + model.draftGap.column.x - cameraX;
  const top = Math.min(model.draftGap.startY, model.draftGap.currentY);
  const height = Math.abs(model.draftGap.currentY - model.draftGap.startY);
  context.fillStyle = "#22c55e88";
  context.fillRect(x, top, model.draftGap.column.width, height);
}

export function draw(model, context) {
  context.fillStyle = "#080d18";
  context.fillRect(0, 0, 800, 560);
  if (model.side === "race") {
    const distance = Math.abs(model.player.x - model.computerPlayer.x);
    if (distance > 500) {
      drawColumns(context, model, model.player.x - 110, 0, 398);
      drawColumns(context, model, model.computerPlayer.x - 110, 402, 398);
      drawPlayer(context, model.player, model.player.x - 110, 0, "#fbbf24");
      drawPlayer(context, model.computerPlayer, model.computerPlayer.x - 110, 402, "#fb7185");
      context.fillStyle = "#f8fafc";
      context.fillRect(399, 0, 2, 560);
      drawText(context, "YOU", 24, 28, 14, "#fbbf24");
      drawText(context, "COMPUTER", 426, 28, 14, "#fb7185");
    } else {
      const cameraX = Math.max(0, Math.min(model.player.x, model.computerPlayer.x) - 110);
      drawColumns(context, model, cameraX, 0, 800);
      drawPlayer(context, model.player, cameraX, 0, "#fbbf24");
      drawPlayer(context, model.computerPlayer, cameraX, 0, "#fb7185");
      drawText(context, "YOU", 16, 28, 14, "#fbbf24");
      drawText(context, "COMPUTER", 112, 28, 14, "#fb7185");
    }
    drawText(context, `You: ${model.player.columnsPassed} columns · Lives ${model.raceLives.human}    Computer: ${model.computerPlayer.columnsPassed} columns · Lives ${model.raceLives.computer}`, 16, 542, 12, "#64748b");
  } else {
    drawColumns(context, model, model.cameraX, 0, 800);
    drawDraftGap(context, model, model.cameraX, 0);
    drawPlayer(context, model.player, model.cameraX, 0, model.side === "climber" ? "#fbbf24" : "#fb7185");
    if (model.side === "builder" || model.side === "layout") {
      drawText(context, `Builder tool: ${model.tool === "gap" ? "draw a gap" : "add a column"} · drag sideways to pan`, 16, 28, 14, "#cbd5e1");
    } else {
      drawText(context, "Hold Up/Down to drift · tap/click the upper/lower half to bounce", 16, 28, 14, "#cbd5e1");
    }
    drawText(context, `Furthest: ${model.furthestColumns} columns`, 400, 516, 14, "#22d3ee", "center");
    drawText(context, `Score: ${model.score} · reach the far right to win`, 16, 542, 12, "#64748b");
  }
}
