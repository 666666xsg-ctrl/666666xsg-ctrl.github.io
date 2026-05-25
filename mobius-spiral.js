import * as THREE from "./vendor/three.module.js";

const PLANE_SEGMENTS = 28;
const BASE_SCALE_X = 1.78;
const BASE_SCALE_Y = 1.04;
const VERTICAL_GAP = 0.78;
const ANGLE_GAP = 0.92;
const BASE_RADIUS = 1.96;
const MIN_WHEEL_SPEED = 0.00015;
const AUTO_SCROLL_SPEED = 0.0042;
const textureCache = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function projectTextureName(project) {
  return project.title.replace(/\s+/g, "").toLowerCase();
}

function createPlaceholderTexture(index) {
  const palettes = [
    [19, 30, 245],
    [40, 238, 205],
    [250, 202, 82],
    [160, 245, 94],
    [245, 84, 174],
    [245, 245, 245]
  ];
  const [r, g, b] = palettes[index % palettes.length];
  const data = new Uint8Array([
    r,
    g,
    b,
    255,
    Math.max(0, r - 40),
    Math.max(0, g - 40),
    Math.max(0, b - 40),
    255,
    Math.min(255, r + 50),
    Math.min(255, g + 50),
    Math.min(255, b + 50),
    255,
    12,
    12,
    12,
    255
  ]);
  const texture = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  #define PI 3.14159265359

  uniform float uScrollSpeed;
  uniform float uRibbonBend;

  void main() {
    vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    vec3 newPosition = position;

    newPosition.z = sin(uv.x * PI) * uRibbonBend;
    newPosition.y += sin(uv.x * PI) * (uv.y - 0.5) * 0.035;

    vec4 modelPosition = modelMatrix * vec4(newPosition, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;

    viewPosition.x += pow(worldPosition.y, 2.0) * 0.1;
    viewPosition.x += sin(uv.y * PI) * uScrollSpeed * 2.0;

    gl_Position = projectionMatrix * viewPosition;

    vUv = uv;
    vWorldPosition = worldPosition;
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uColorStrength;
  uniform float uZoom;
  uniform vec2 uPlaneSizes;
  uniform vec2 uImageSizes;
  uniform float uRevealProgress;

  varying vec2 vUv;

  float roundedRectSDF(vec2 uv, vec2 size, float radius) {
    vec2 d = abs(uv - 0.5) - size * 0.5 + radius;
    return length(max(d, 0.0)) - radius;
  }

  void main() {
    vec2 ratio = vec2(
      min((uPlaneSizes.x / uPlaneSizes.y) / (uImageSizes.x / uImageSizes.y), 1.0),
      min((uPlaneSizes.y / uPlaneSizes.x) / (uImageSizes.y / uImageSizes.x), 1.0)
    );

    vec2 uv = vec2(
      vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
      vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
    );

    vec2 zoomedUv = (uv - 0.5) / uZoom + 0.5;
    vec4 color;

    if (gl_FrontFacing) {
      color = texture2D(uTexture, zoomedUv);
      color = mix(color, vec4(0.0, 0.0, 0.0, 1.0), uColorStrength);
    } else {
      float offset = 40.0 / 1024.0;
      vec4 c = vec4(0.0);

      c += texture2D(uTexture, uv + vec2(-offset, -offset)) * 1.0;
      c += texture2D(uTexture, uv + vec2( 0.0,    -offset)) * 2.0;
      c += texture2D(uTexture, uv + vec2( offset, -offset)) * 1.0;
      c += texture2D(uTexture, uv + vec2(-offset,  0.0))    * 2.0;
      c += texture2D(uTexture, uv)                           * 4.0;
      c += texture2D(uTexture, uv + vec2( offset,  0.0))    * 2.0;
      c += texture2D(uTexture, uv + vec2(-offset,  offset)) * 1.0;
      c += texture2D(uTexture, uv + vec2( 0.0,     offset)) * 2.0;
      c += texture2D(uTexture, uv + vec2( offset,  offset)) * 1.0;
      c /= 16.0;
      c.rgb *= 0.58;
      color = c;
    }

    float reveal = clamp(uRevealProgress, 0.0, 1.0);
    vec2 revealSize = vec2(reveal);
    float radius = 0.05 * reveal;
    float sdf = roundedRectSDF(vUv, revealSize, radius);
    float alpha = 1.0 - smoothstep(0.0, 0.002, sdf);

    alpha *= smoothstep(0.1, 1.0, uRevealProgress);
    gl_FragColor = vec4(color.rgb, alpha);
  }
`;

class ProjectPlane extends THREE.Mesh {
  constructor(project, index, projectsCount, geometry, texture, imageSize) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
      uTexture: { value: texture },
      uColorStrength: { value: 0 },
      uZoom: { value: 1 },
      uPlaneSizes: { value: new THREE.Vector2(BASE_SCALE_X, BASE_SCALE_Y) },
      uImageSizes: { value: imageSize.clone() },
      uRevealProgress: { value: 1 },
      uScrollSpeed: { value: 0 },
      uRibbonBend: { value: 0.28 }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      side: THREE.DoubleSide
    });

    super(geometry, material);
    this.project = project;
    this.index = index;
    this.projectsCount = projectsCount;
    this.centerIndex = Math.floor(projectsCount / 2);
    this.hoverProgress = 0;
    this.hoverTarget = 0;
    this.hiddenProgress = 0;
    this.hiddenTarget = 0;
    this.isHovered = false;
    this.frustumCulled = false;
    this.scale.set(BASE_SCALE_X, BASE_SCALE_Y, 1);
    this.userData.project = project;
    this.userData.textureName = projectTextureName(project);
  }

  setTexture(texture, width, height) {
    this.material.uniforms.uTexture.value = texture;
    this.material.uniforms.uImageSizes.value.set(width || 1, height || 1);
    this.material.needsUpdate = true;
  }

  setHovered(isHovered) {
    this.isHovered = isHovered;
    this.hoverTarget = isHovered ? 1 : 0;
  }

  reveal() {
    this.hiddenTarget = 0;
  }

  hide() {
    this.hiddenTarget = 1;
  }

  update(controls, delta) {
    const hoverEase = this.isHovered ? 0.09 : 0.07;
    const hoverAmount = 1 - Math.pow(1 - hoverEase, delta * 0.2);
    this.hoverProgress = lerp(this.hoverProgress, this.hoverTarget, hoverAmount);

    const hiddenAmount = 1 - Math.pow(1 - 0.05, delta * 0.15);
    this.hiddenProgress = lerp(this.hiddenProgress, this.hiddenTarget, hiddenAmount);

    let normalizedIndex = this.index - controls.scrollOffset;
    normalizedIndex = (normalizedIndex % this.projectsCount + this.projectsCount) % this.projectsCount;

    const relative = normalizedIndex - this.centerIndex;
    this.visible = Math.abs(relative) < 8.5 && this.hiddenProgress < 0.98;

    const hideDirection = this.hiddenTarget ? 1.5 : -1.5;
    const y = relative * VERTICAL_GAP - 0.62 - this.hiddenProgress * hideDirection;
    const radius = BASE_RADIUS * (1 - this.hiddenProgress / 2);
    const angle = relative * ANGLE_GAP;

    this.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    this.rotation.set(0, -angle + Math.PI / 2, 0);
    this.renderOrder = Math.round((this.position.z + 4) * 1000);

    const uniforms = this.material.uniforms;
    uniforms.uColorStrength.value = 0.55 * this.hoverProgress;
    uniforms.uZoom.value = 1 + 0.05 * this.hoverProgress;
    uniforms.uRevealProgress.value = (1 - this.hoverProgress * 0.05) * (1 - this.hiddenProgress);
    uniforms.uScrollSpeed.value = controls.wheelDeltaY;
    uniforms.uRibbonBend.value = 0.26 + Math.min(0.08, Math.abs(controls.wheelDeltaY) * 0.09);
  }

  disposePlane() {
    this.material.dispose();
  }
}

class Controls {
  constructor(element, getSize) {
    this.element = element;
    this.getSize = getSize;
    this.easing = 0.1;
    this.wheelDirection = 1;
    this.wheelDeltaY = 0;
    this.targetWheelDeltaY = 0;
    this.scrollOffset = 0;
    this.normalizedMouse = new THREE.Vector2(100, 100);
    this.isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    this.touchStartX = 0;
    this.lastTouchX = 0;
    this.touchVelocityX = 0;
    this.isDragging = false;

    this.onWheel = this.onWheel.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);

    window.addEventListener("wheel", this.onWheel, { passive: false });
    element.addEventListener("mouseleave", this.onMouseLeave);
    if (this.isTouchDevice) {
      element.addEventListener("touchstart", this.onTouchStart, { passive: true });
      element.addEventListener("touchmove", this.onTouchMove, { passive: false });
      element.addEventListener("touchend", this.onTouchEnd);
    } else {
      window.addEventListener("mousemove", this.onMouseMove, { passive: true });
    }
  }

  onWheel(event) {
    if (event.cancelable) event.preventDefault();
    this.targetWheelDeltaY += event.deltaY * 0.0018;
    this.targetWheelDeltaY = clamp(this.targetWheelDeltaY, -2, 2);
    this.wheelDirection = event.deltaY > 0 ? 1 : -1;
  }

  onMouseMove(event) {
    const { width, height, left, top } = this.getSize();
    this.normalizedMouse.x = ((event.clientX - left) / width) * 2 - 1;
    this.normalizedMouse.y = -(((event.clientY - top) / height) * 2 - 1);
  }

  onMouseLeave() {
    this.normalizedMouse.set(100, 100);
  }

  onTouchStart(event) {
    const touch = event.touches[0];
    if (!touch) return;
    this.touchStartX = touch.clientX;
    this.lastTouchX = touch.clientX;
    this.touchVelocityX = 0;
    this.isDragging = false;
  }

  onTouchMove(event) {
    const touch = event.touches[0];
    if (!touch) return;
    const moved = touch.clientX - this.touchStartX;
    if (!this.isDragging && Math.abs(moved) > 8) this.isDragging = true;
    if (!this.isDragging) return;

    event.preventDefault();
    const delta = -(touch.clientX - this.lastTouchX) * 0.5;
    this.targetWheelDeltaY -= delta * 0.003;
    this.targetWheelDeltaY = clamp(this.targetWheelDeltaY, -2, 2);
    this.wheelDirection = delta < 0 ? 1 : -1;
    this.touchVelocityX = delta;
    this.lastTouchX = touch.clientX;
  }

  onTouchEnd() {
    if (this.isDragging) {
      this.targetWheelDeltaY -= this.touchVelocityX * 0.002;
      this.targetWheelDeltaY = clamp(this.targetWheelDeltaY, -2, 2);
    }
    this.isDragging = false;
    this.touchVelocityX = 0;
  }

  update() {
    const targetSpeed = AUTO_SCROLL_SPEED + this.targetWheelDeltaY;
    this.wheelDeltaY += (targetSpeed - this.wheelDeltaY) * this.easing;
    this.scrollOffset += this.wheelDeltaY;
    if (Math.abs(this.targetWheelDeltaY) < MIN_WHEEL_SPEED) {
      this.targetWheelDeltaY = 0;
    } else {
      this.targetWheelDeltaY *= 0.88;
    }
  }

  destroy() {
    window.removeEventListener("wheel", this.onWheel);
    this.element.removeEventListener("mouseleave", this.onMouseLeave);
    window.removeEventListener("mousemove", this.onMouseMove);
    this.element.removeEventListener("touchstart", this.onTouchStart);
    this.element.removeEventListener("touchmove", this.onTouchMove);
    this.element.removeEventListener("touchend", this.onTouchEnd);
  }
}

export function createMobiusSpiral(container, projects, options = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
    stencil: false
  });
  const raycaster = new THREE.Raycaster();
  const loader = new THREE.TextureLoader();
  const viewport = { width: 1, height: 1, left: 0, top: 0 };
  const repeatedProjects = [...projects, ...projects];
  const geometry = new THREE.PlaneGeometry(1, 1, PLANE_SEGMENTS, PLANE_SEGMENTS);
  const planes = [];
  const placeholders = [];
  const hitLayer = document.createElement("div");
  const controls = new Controls(renderer.domElement, () => viewport);

  let frameId = 0;
  let lastTime = performance.now();
  let hoveredPlane = null;
  let disposed = false;
  let loaded = 0;
  let pointerDown = null;
  let lastNavigationAt = 0;

  renderer.setClearColor(0x0e0e0e, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.pointerEvents = "auto";
  hitLayer.className = "spiral-hit-layer";
  container.appendChild(renderer.domElement);
  container.appendChild(hitLayer);
  loader.setCrossOrigin("anonymous");
  scene.add(camera);

  repeatedProjects.forEach((project, index) => {
    const placeholder = createPlaceholderTexture(index);
    const plane = new ProjectPlane(
      project,
      index,
      repeatedProjects.length,
      geometry,
      placeholder,
      new THREE.Vector2(2, 1)
    );

    placeholders.push(placeholder);
    planes.push(plane);
    scene.add(plane);

    const hitTarget = document.createElement("button");
    hitTarget.type = "button";
    hitTarget.className = "spiral-hit-target";
    hitTarget.setAttribute("aria-label", project.title);
    hitTarget.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigatePlane(plane, event);
    });
    hitTarget.addEventListener("pointerenter", () => {
      if (hoveredPlane && hoveredPlane !== plane) hoveredPlane.setHovered(false);
      hoveredPlane = plane;
      hoveredPlane.setHovered(true);
      container.style.cursor = "pointer";
      options.onHover?.(hoveredPlane.project);
    });
    hitTarget.addEventListener("pointerleave", () => {
      if (hoveredPlane === plane) clearHover();
    });
    plane.hitTarget = hitTarget;
    hitLayer.appendChild(hitTarget);

    const cached = textureCache.get(project.thumb);
    if (cached?.texture) {
      plane.setTexture(cached.texture, cached.width, cached.height);
      loaded += 1;
      return;
    }

    if (cached?.promise) {
      cached.promise
        .then((entry) => {
          if (disposed) return;
          plane.setTexture(entry.texture, entry.width, entry.height);
          loaded += 1;
        })
        .catch(() => {
          loaded += 1;
        });
      return;
    }

    const promise = new Promise((resolve, reject) => {
      loader.load(
        project.thumb,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          texture.generateMipmaps = false;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          texture.needsUpdate = true;

          const image = texture.image || {};
          const entry = {
            texture,
            width: image.naturalWidth || image.width || 2,
            height: image.naturalHeight || image.height || 1
          };
          textureCache.set(project.thumb, entry);
          resolve(entry);
        },
        undefined,
        reject
      );
    });

    textureCache.set(project.thumb, { promise });
    promise
      .then((entry) => {
        if (disposed) return;
        plane.setTexture(entry.texture, entry.width, entry.height);
        loaded += 1;
      })
      .catch(() => {
        textureCache.delete(project.thumb);
        loaded += 1;
      });
  });

  container.dataset.mobiusInit = `planes:${planes.length}`;

  function resize() {
    const rect = container.getBoundingClientRect();
    viewport.width = Math.max(1, rect.width);
    viewport.height = Math.max(1, rect.height);
    viewport.left = rect.left;
    viewport.top = rect.top;
    renderer.setSize(viewport.width, viewport.height, false);
    camera.aspect = viewport.width / viewport.height;
    camera.fov = viewport.width < 900 ? 45 : 35;
    camera.position.set(0, 0, 8);
    camera.updateProjectionMatrix();
  }

  function clearHover() {
    if (hoveredPlane) hoveredPlane.setHovered(false);
    hoveredPlane = null;
    container.style.cursor = "";
    options.onHover?.(null);
  }

  function normalizedPointerFromEvent(event) {
    const rect = container.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);

    return new THREE.Vector2(
      ((event.clientX - rect.left) / width) * 2 - 1,
      -(((event.clientY - rect.top) / height) * 2 - 1)
    );
  }

  function getPlaneScreenRect(plane) {
    plane.updateMatrixWorld(true);
    const corners = [
      new THREE.Vector3(-0.5, -0.5, 0),
      new THREE.Vector3(0.5, -0.5, 0),
      new THREE.Vector3(0.5, 0.5, 0),
      new THREE.Vector3(-0.5, 0.5, 0)
    ].map((corner) => corner.applyMatrix4(plane.matrixWorld).project(camera));

    const xs = corners.map((point) => (point.x * 0.5 + 0.5) * viewport.width + viewport.left);
    const ys = corners.map((point) => (-point.y * 0.5 + 0.5) * viewport.height + viewport.top);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top)
    };
  }

  function pickPlane(pointer, { requireFacing = false, hiddenLimit = 0.18 } = {}) {
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(planes, false);

    for (const intersection of intersections) {
      const plane = intersection.object;
      if (!plane || plane.hiddenProgress > hiddenLimit) continue;

      if (requireFacing && intersection.face) {
        const normal = intersection.face.normal.clone().transformDirection(plane.matrixWorld);
        if (normal.dot(raycaster.ray.direction) >= 0) continue;
      }

      return { plane, intersection };
    }

    return null;
  }

  function pickPlaneByScreenPoint(event, hiddenLimit = 0.36) {
    const x = event.clientX;
    const y = event.clientY;
    const candidates = planes
      .map((plane) => {
        if (plane.hiddenProgress > hiddenLimit) return null;
        const rect = getPlaneScreenRect(plane);
        const padding = Math.max(14, Math.min(rect.width, rect.height) * 0.1);
        const inside =
          x >= rect.left - padding &&
          x <= rect.left + rect.width + padding &&
          y >= rect.top - padding &&
          y <= rect.top + rect.height + padding;
        if (!inside) return null;

        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.hypot(x - centerX, y - centerY);
        return { plane, rect, distance };
      })
      .filter(Boolean)
      .sort((a, b) => b.plane.position.z - a.plane.position.z || a.distance - b.distance);

    return candidates[0] || null;
  }

  function pickFromEvent(event) {
    return pickPlane(normalizedPointerFromEvent(event), { hiddenLimit: 0.36 }) || pickPlaneByScreenPoint(event);
  }

  function navigatePlane(plane, event) {
    if (!plane || plane.hiddenProgress > 0.42) return;
    const now = performance.now();
    if (now - lastNavigationAt < 380) return;
    lastNavigationAt = now;

    options.onNavigate?.(plane.project, {
      event,
      plane,
      rect: getPlaneScreenRect(plane)
    });
  }

  function updateHitTargets() {
    planes.forEach((plane) => {
      const target = plane.hitTarget;
      if (!target) return;

      const rect = getPlaneScreenRect(plane);
      const hidden =
        !plane.visible ||
        plane.hiddenProgress > 0.3 ||
        rect.width < 24 ||
        rect.height < 24 ||
        rect.left > viewport.left + viewport.width ||
        rect.left + rect.width < viewport.left ||
        rect.top > viewport.top + viewport.height ||
        rect.top + rect.height < viewport.top;

      target.hidden = hidden;
      if (hidden) {
        target.style.pointerEvents = "none";
        return;
      }

      target.style.pointerEvents = "auto";
      target.style.left = `${rect.left - viewport.left}px`;
      target.style.top = `${rect.top - viewport.top}px`;
      target.style.width = `${rect.width}px`;
      target.style.height = `${rect.height}px`;
      target.style.zIndex = String(Math.max(1, Math.round((plane.position.z + 6) * 100)));
    });
  }

  function updateHover() {
    if (controls.normalizedMouse.x > 2 || controls.isTouchDevice) {
      clearHover();
      return;
    }

    const picked = pickPlane(controls.normalizedMouse, { requireFacing: true, hiddenLimit: 0.01 });
    if (!picked) {
      clearHover();
      return;
    }

    const plane = picked.plane;
    if (hoveredPlane !== plane) {
      if (hoveredPlane) hoveredPlane.setHovered(false);
      hoveredPlane = plane;
      hoveredPlane.setHovered(true);
      container.style.cursor = "pointer";
      options.onHover?.(hoveredPlane.project);
    }
  }

  function animate(time) {
    if (disposed) return;
    const delta = Math.min(50, time - lastTime || 16);
    lastTime = time;

    controls.update();
    planes.forEach((plane) => plane.update(controls, delta));
    updateHover();
    updateHitTargets();
    renderer.render(scene, camera);

    renderer.domElement.dataset.mobiusFrame = String((Number(renderer.domElement.dataset.mobiusFrame) || 0) + 1);
    renderer.domElement.dataset.mobiusLoaded = String(loaded);
    renderer.domElement.dataset.mobiusScroll = controls.scrollOffset.toFixed(3);
    renderer.domElement.dataset.mobiusVisible = planes
      .filter((plane) => plane.position.y > -3.2 && plane.position.y < 3.2)
      .slice(0, 4)
      .map((plane) => `${plane.project.title}:${plane.position.x.toFixed(1)},${plane.position.y.toFixed(1)},${plane.position.z.toFixed(1)}`)
      .join("|");

    window.__mobiusDebug = {
      cards: planes.length,
      frame: (window.__mobiusDebug?.frame || 0) + 1,
      loaded,
      scrollOffset: Number(controls.scrollOffset.toFixed(3)),
      visible: planes
        .map((plane) => ({
          title: plane.project.title,
          x: Number(plane.position.x.toFixed(2)),
          y: Number(plane.position.y.toFixed(2)),
          z: Number(plane.position.z.toFixed(2)),
          ry: Number(plane.rotation.y.toFixed(2))
        }))
        .filter((plane) => plane.y > -3.2 && plane.y < 3.2)
        .slice(0, 10),
      renderer: renderer.info
    };

    frameId = requestAnimationFrame(animate);
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    pointerDown = {
      x: event.clientX,
      y: event.clientY,
      picked: pickFromEvent(event)
    };
  }

  function onPointerUp(event) {
    if (!pointerDown) return;
    const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
    const picked = moved < 12 ? pickFromEvent(event) || pointerDown.picked : null;
    pointerDown = null;
    if (!picked) return;
    event.preventDefault();
    navigatePlane(picked.plane, event);
  }

  function onClick(event) {
    const picked = pickFromEvent(event);
    if (!picked) return;
    event.preventDefault();
    navigatePlane(picked.plane, event);
  }

  resize();
  window.addEventListener("resize", resize);
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("click", onClick);
  frameId = requestAnimationFrame(animate);

  return {
    reveal() {
      planes.forEach((plane, index) => {
        setTimeout(() => plane.reveal(), (index % 4) * 50);
      });
    },
    hide() {
      planes.forEach((plane, index) => {
        setTimeout(() => plane.hide(), (index % 4) * 30);
      });
    },
    destroy() {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("click", onClick);
      controls.destroy();
      clearHover();

      planes.forEach((plane) => {
        scene.remove(plane);
        plane.disposePlane();
      });
      placeholders.forEach((texture) => texture.dispose());
      geometry.dispose();
      renderer.dispose();
      hitLayer.remove();
      renderer.domElement.remove();
    }
  };
}
