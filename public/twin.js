import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

let renderer, scene, camera, frame, nodes = [], raycaster, pointer, group, canvasEl;
let hovered = null;
let pulses = [];
let pmremGenerator, envRT;

function colorFor(node) {
  if (node.kind === "system") return 0x3ee0c6;
  if (node.changed) return 0xfbbf24;
  if (node.risk === "HIGH" || node.risk === "CRITICAL") return 0xfb7185;
  if (node.verification === "verified") return 0x34d399;
  return 0x5ec8ff;
}

function disposeTwin() {
  if (frame) cancelAnimationFrame(frame);
  frame = null;
  if (envRT) envRT.dispose();
  if (pmremGenerator) pmremGenerator.dispose();
  envRT = null;
  pmremGenerator = null;
  if (renderer) {
    renderer.dispose();
    renderer.domElement.replaceWith(renderer.domElement.cloneNode(false));
  }
  renderer = null;
  scene = null;
  nodes = [];
  pulses = [];
  hovered = null;
}

function showPanel(node) {
  const panel = document.getElementById("twin-panel");
  if (!panel) return;
  panel.innerHTML = `
    <div class="field-label">${node.label}</div>
    <p class="field-value" style="margin:6px 0 12px">${node.kind}</p>
    <div class="field-label">Current</div>
    <p class="field-value">${node.current || "—"}</p>
    <div class="field-label" style="margin-top:10px">Previous</div>
    <p class="field-value">${node.previous || "—"}</p>
    <div class="field-label" style="margin-top:10px">Evidence</div>
    <p class="field-value">${node.evidenceId || "none yet"}</p>
    <div class="field-label" style="margin-top:10px">Timestamp</div>
    <p class="field-value">${node.timestamp ? new Date(node.timestamp).toLocaleString() : "—"}</p>
    <div class="field-label" style="margin-top:10px">Verification</div>
    <p class="field-value">${node.verification || "—"}</p>
    <div class="field-label" style="margin-top:10px">AI risk analysis</div>
    <p class="field-value">${node.risk || "unanalyzed"}</p>
    <p class="footnote">${node.analysis?.summary || "Analyze a sealed change to attach risk context."}</p>
    ${node.evidenceId ? `<div class="actions"><a class="btn btn-secondary" href="#/evidence/${encodeURIComponent(node.evidenceId)}">Open receipt</a></div>` : ""}
  `;
}

async function mountTwin() {
  const canvas = document.getElementById("twin-canvas");
  if (!canvas) return;
  disposeTwin();
  canvasEl = canvas;

  const data = await fetch("/api/twin").then((r) => r.json());
  const width = canvas.parentElement.clientWidth;
  const height = canvas.parentElement.clientHeight || 500;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070c, 0.055);
  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 1.4, 8.2);
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // Procedural studio environment — gives the clearcoat/metal nodes real
  // reflections and highlights to catch, instead of flat, hazy color fills.
  // No external HDR fetch (avoids CORS/network issues), fully local to three.
  pmremGenerator = new THREE.PMREMGenerator(renderer);
  envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;

  scene.add(new THREE.AmbientLight(0xb7d4ff, 0.35));
  const key = new THREE.PointLight(0x3ee0c6, 18, 22);
  key.position.set(2, 3, 4);
  scene.add(key);
  const fill = new THREE.PointLight(0x9b8cff, 9, 18);
  fill.position.set(-3, -1, 3);
  scene.add(fill);
  const rim = new THREE.PointLight(0x5ec8ff, 8, 20);
  rim.position.set(0, -3, -2);
  scene.add(rim);

  group = new THREE.Group();
  scene.add(group);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.01, 16, 120),
    new THREE.MeshBasicMaterial({ color: 0x3ee0c6, transparent: true, opacity: 0.22 }),
  );
  ring.rotation.x = Math.PI / 2.4;
  group.add(ring);

  // Floating dais beneath the system for grounded depth
  const dais = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 64),
    new THREE.MeshBasicMaterial({ color: 0x3ee0c6, transparent: true, opacity: 0.05 }),
  );
  dais.rotation.x = -Math.PI / 2;
  dais.position.y = -2.6;
  group.add(dais);

  const layout = {
    system: [0, 0, 0],
    model: [2.4, 0.6, 0.2],
    prompt: [1.5, -1.5, 0.4],
    policy: [-1.6, -1.4, 0.3],
    tools: [-2.5, 0.7, 0.2],
    deployment: [0.1, 2.1, -0.2],
  };

  nodes = [];
  const byId = {};
  for (const node of data.nodes) {
    const pos = layout[node.id] || [0, 0, 0];
    const geo = node.kind === "system" ? new THREE.SphereGeometry(0.42, 48, 48) : new THREE.SphereGeometry(0.26, 40, 40);
    // Punchy glossy "plastic" node — solid color, no transmission. The
    // clearcoat + env map do the work of making it read as premium and
    // dimensional instead of the flat/hazy look a transmissive shell gave.
    const mat = new THREE.MeshPhysicalMaterial({
      color: colorFor(node),
      emissive: colorFor(node),
      emissiveIntensity: node.changed ? 0.75 : 0.3,
      metalness: 0.35,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.35,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(...pos);
    mesh.userData = node;
    mesh.userData.baseScale = 1;
    mesh.userData.baseEmissive = node.changed ? 0.75 : 0.3;
    group.add(mesh);
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(node.kind === "system" ? 0.58 : 0.38, 16, 16),
      new THREE.MeshBasicMaterial({ color: colorFor(node), transparent: true, opacity: node.changed ? 0.16 : 0.06 }),
    );
    glow.position.copy(mesh.position);
    group.add(glow);
    mesh.userData.glow = glow;
    nodes.push(mesh);
    byId[node.id] = mesh;
  }

  const lineMat = new THREE.LineBasicMaterial({ color: 0x6aa7c7, transparent: true, opacity: 0.4 });
  pulses = [];
  for (const id of ["model", "prompt", "policy", "tools", "deployment"]) {
    if (!byId.system || !byId[id]) continue;
    const from = byId.system.position.clone();
    const to = byId[id].position.clone();
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), lineMat));

    // Animated pulse traveling along the connection for changed components —
    // a lightweight, purely visual "data flow" indicator (no new deps).
    if (byId[id].userData.changed) {
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 12, 12),
        new THREE.MeshBasicMaterial({ color: colorFor(byId[id].userData) }),
      );
      pulse.userData = { from, to, t: Math.random() };
      group.add(pulse);
      pulses.push(pulse);
    }
  }

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  function pickAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(nodes)[0] || null;
  }

  canvas.addEventListener("pointerdown", (event) => {
    const hit = pickAt(event.clientX, event.clientY);
    if (hit) showPanel(hit.object.userData);
  });

  canvas.addEventListener("pointermove", (event) => {
    const hit = pickAt(event.clientX, event.clientY);
    const next = hit ? hit.object : null;
    if (next !== hovered) {
      if (hovered) hovered.userData.hovered = false;
      if (next) next.userData.hovered = true;
      hovered = next;
      canvas.style.cursor = next ? "pointer" : "grab";
    }
  });

  canvas.addEventListener("pointerleave", () => {
    if (hovered) hovered.userData.hovered = false;
    hovered = null;
    canvas.style.cursor = "grab";
  });

  const tick = () => {
    if (!renderer) return;
    group.rotation.y += 0.0024;
    nodes.forEach((mesh, i) => {
      mesh.position.y += Math.sin(Date.now() / 700 + i) * 0.0008;
      const targetScale = mesh.userData.hovered ? 1.18 : 1;
      mesh.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.15);
      mesh.material.emissiveIntensity +=
        ((mesh.userData.hovered ? mesh.userData.baseEmissive + 0.4 : mesh.userData.baseEmissive) -
          mesh.material.emissiveIntensity) *
        0.15;
      if (mesh.userData.glow) mesh.userData.glow.position.copy(mesh.position);
    });
    pulses.forEach((pulse) => {
      pulse.userData.t += 0.006;
      if (pulse.userData.t > 1) pulse.userData.t = 0;
      pulse.position.lerpVectors(pulse.userData.from, pulse.userData.to, pulse.userData.t);
    });
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };
  tick();

  const systemNode = data.nodes.find((n) => n.kind === "system") || data.nodes[0];
  if (systemNode) showPanel(systemNode);
}

window.addEventListener("proofai:twin", () => {
  mountTwin().catch((error) => {
    const panel = document.getElementById("twin-panel");
    if (panel) panel.innerHTML = `<div class="error">${error.message}</div>`;
  });
});
