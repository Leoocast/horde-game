/* ==========================================================================
   HOSTFALL TCG - Card Animation Laboratory Engine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // --- Element References ---
  const arena = document.getElementById('arena');
  const vignette = document.getElementById('vignette');
  const pactoCard = document.getElementById('pactoCard');
  const card1 = document.getElementById('card1');
  const card2 = document.getElementById('card2');
  const lifeContainer = document.getElementById('lifeContainer');
  const lifeValueEl = document.getElementById('lifeValue');
  const damagePopup = document.getElementById('damagePopup');
  const diamondBadge = document.getElementById('diamondBadge');
  const vampireBite = document.getElementById('vampireBite');
  const playBtn = document.getElementById('playBtn');
  const playBtnText = document.getElementById('playBtnText');
  const resetBtn = document.getElementById('resetBtn');
  const speedSlider = document.getElementById('speedSlider');
  const speedVal = document.getElementById('speedVal');
  const handCards = document.getElementById('handCards');
  const stageZone = document.getElementById('stageZone');
  const artCanvas = document.getElementById('artCanvas');
  const threeCanvas = document.getElementById('threeCanvas');
  const cardStainCanvas = document.getElementById('cardStainCanvas');

  // Sidebar Elements
  const labSidebar = document.getElementById('labSidebar');
  const labToggleBtn = document.getElementById('labToggleBtn');
  const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
  const cardPresetsGrid = document.getElementById('cardPresetsGrid');
  const sidebarSpeedSlider = document.getElementById('sidebarSpeedSlider');
  const sidebarSpeedVal = document.getElementById('sidebarSpeedVal');
  const loopToggle = document.getElementById('loopToggle');
  const labPlayBtn = document.getElementById('labPlayBtn');
  const labResetBtn = document.getElementById('labResetBtn');
  const activeCardTag = document.getElementById('activeCardTag');

  let animationSpeed = 1.0;
  let isPlaying = false;
  let masterTl = null;
  let activeCardId = 'pacto_sangre';

  // Setup Card Stain Canvas & Offscreen Buffer
  const sctx = cardStainCanvas.getContext('2d');
  const offCanvas = document.createElement('canvas');
  offCanvas.width = 270;
  offCanvas.height = 390;
  const octx = offCanvas.getContext('2d');

  // ==========================================================================
  // --- 1. CARD ANIMATION REGISTRY ---
  // ==========================================================================
  const CARD_ANIMATION_REGISTRY = {
    pacto_sangre: {
      id: 'pacto_sangre',
      name: 'Pacto De Sangre',
      code: 'HFV #010',
      type: 'Conjuro',
      cost: 1,
      tagLabel: '3D VFX Preview · Pacto de Medianoche',
      drawArt: drawCardArtwork,
      playAnimation: executePactoDeSangreAnimation
    }
  };

  // --- 2. Procedural Card Artwork Renderer ---
  function drawCardArtwork() {
    const actx = artCanvas.getContext('2d');
    const w = artCanvas.width;
    const h = artCanvas.height;

    // Background gradient (Dark Gothic Chamber)
    const bgGrad = actx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#100508');
    bgGrad.addColorStop(0.5, '#220a11');
    bgGrad.addColorStop(1, '#0c0305');
    actx.fillStyle = bgGrad;
    actx.fillRect(0, 0, w, h);

    // Stone arches
    actx.strokeStyle = '#38121a';
    actx.lineWidth = 4;
    actx.beginPath();
    actx.arc(w * 0.3, h * 0.4, 40, Math.PI, 0);
    actx.arc(w * 0.7, h * 0.4, 40, Math.PI, 0);
    actx.stroke();

    // Central Chalice
    const chaliceGrad = actx.createLinearGradient(w * 0.4, 0, w * 0.6, 0);
    chaliceGrad.addColorStop(0, '#2d2627');
    chaliceGrad.addColorStop(0.5, '#5c4e51');
    chaliceGrad.addColorStop(1, '#1b1617');

    actx.fillStyle = chaliceGrad;
    actx.beginPath();
    actx.ellipse(w / 2, h * 0.68, 35, 12, 0, 0, Math.PI * 2);
    actx.fill();
    actx.fillRect(w / 2 - 4, h * 0.45, 8, 25);
    actx.ellipse(w / 2, h * 0.42, 45, 18, 0, 0, Math.PI * 2);
    actx.fill();

    // Red Liquid inside Chalice
    actx.fillStyle = '#600010';
    actx.beginPath();
    actx.ellipse(w / 2, h * 0.40, 42, 14, 0, 0, Math.PI * 2);
    actx.fill();

    // Candles
    function drawCandle(x, y) {
      actx.fillStyle = '#1c1718';
      actx.fillRect(x - 6, y, 12, 35);
      const flame = actx.createRadialGradient(x, y - 8, 1, x, y - 8, 10);
      flame.addColorStop(0, '#ffffff');
      flame.addColorStop(0.3, '#ffcc00');
      flame.addColorStop(0.7, '#ff3300');
      flame.addColorStop(1, 'rgba(255,51,0,0)');
      actx.fillStyle = flame;
      actx.beginPath();
      actx.arc(x, y - 8, 10, 0, Math.PI * 2);
      actx.fill();
    }
    drawCandle(w * 0.2, h * 0.25);
    drawCandle(w * 0.8, h * 0.32);

    // Bound wrists with red thread
    actx.strokeStyle = '#800010';
    actx.lineWidth = 2;
    actx.beginPath();
    actx.ellipse(w * 0.35, h * 0.52, 15, 6, 0.2, 0, Math.PI * 2);
    actx.ellipse(w * 0.65, h * 0.52, 15, 6, -0.2, 0, Math.PI * 2);
    actx.stroke();
  }
  drawCardArtwork();

  // ==========================================================================
  // --- 3. Ultra-Realistic Organic Liquid Blood Staining Engine ---
  // ==========================================================================
  class OrganicBloodStain {
    constructor(x, y, maxRadius) {
      this.x = x;
      this.y = y;
      this.currentRadius = 5;
      this.maxRadius = maxRadius;
      this.growthSpeed = 10 + Math.random() * 8;
      this.numLobs = 14;
      this.offsets = Array.from({ length: 14 }, () => 0.65 + Math.random() * 0.55);
      this.satellites = Array.from({ length: 5 }, () => ({
        angle: Math.random() * Math.PI * 2,
        distRatio: 1.05 + Math.random() * 0.3,
        rRatio: 0.08 + Math.random() * 0.12
      }));
      this.active = true;
    }

    update(dt60 = 1.0) {
      if (!this.active) return;
      this.currentRadius += this.growthSpeed * dt60;
      if (this.currentRadius >= this.maxRadius) {
        this.currentRadius = this.maxRadius;
        this.active = false;
      }
    }

    draw(context) {
      context.save();
      context.beginPath();

      const r = this.currentRadius;
      for (let i = 0; i <= this.numLobs; i++) {
        const angle = (i / this.numLobs) * Math.PI * 2;
        const nextAngle = ((i + 1) / this.numLobs) * Math.PI * 2;
        const lobRadius = r * this.offsets[i % this.numLobs];
        const nextLobRadius = r * this.offsets[(i + 1) % this.numLobs];

        const px = this.x + Math.cos(angle) * lobRadius;
        const py = this.y + Math.sin(angle) * lobRadius;
        const nx = this.x + Math.cos(nextAngle) * nextLobRadius;
        const ny = this.y + Math.sin(nextAngle) * nextLobRadius;

        const cx = (px + nx) / 2;
        const cy = (py + ny) / 2;

        if (i === 0) context.moveTo(px, py);
        context.quadraticCurveTo(px, py, cx, cy);
      }
      context.closePath();

      // Deep Guinda Liquid Blood Gradient
      const grad = context.createRadialGradient(this.x, this.y, 0, this.x, this.y, r);
      grad.addColorStop(0, 'rgba(80, 0, 15, 0.98)');
      grad.addColorStop(0.55, 'rgba(52, 0, 9, 0.90)');
      grad.addColorStop(0.85, 'rgba(30, 0, 5, 0.65)');
      grad.addColorStop(1, 'rgba(15, 0, 2, 0)');

      context.fillStyle = grad;
      context.fill();

      // Micro Splatter Droplets around stain
      if (r > 12) {
        for (let sat of this.satellites) {
          const satX = this.x + Math.cos(sat.angle) * (r * sat.distRatio);
          const satY = this.y + Math.sin(sat.angle) * (r * sat.distRatio);
          const satR = Math.max(1.5, r * sat.rRatio);

          context.beginPath();
          context.arc(satX, satY, satR, 0, Math.PI * 2);
          context.fillStyle = 'rgba(160, 0, 20, 0.88)';
          context.fill();
        }
      }

      context.restore();
    }
  }

  let activeCardStains = [];
  let isStainingCard = false;
  let lastStainTime = performance.now();

  function triggerCardBloodStaining() {
    isStainingCard = true;
    activeCardStains = [];
    octx.clearRect(0, 0, offCanvas.width, offCanvas.height);
    sctx.clearRect(0, 0, cardStainCanvas.width, cardStainCanvas.height);

    // Initial Main Puncture Blotches
    activeCardStains.push(new OrganicBloodStain(135, 195, 190));
    activeCardStains.push(new OrganicBloodStain(110, 150, 130));
    activeCardStains.push(new OrganicBloodStain(160, 240, 140));

    // Secondary Rapid Splatters
    for (let i = 0; i < 18; i++) {
      setTimeout(() => {
        if (!isStainingCard) return;
        const rx = 15 + Math.random() * 240;
        const ry = 25 + Math.random() * 340;
        const mr = 40 + Math.random() * 85;
        activeCardStains.push(new OrganicBloodStain(rx, ry, mr));
      }, i * 10);
    }
  }

  // Smooth Composite Render Loop with Delta-Time Normalization
  function renderCardStainLoop(nowTime) {
    if (!nowTime) nowTime = performance.now();
    const deltaMs = Math.min(nowTime - lastStainTime, 64);
    lastStainTime = nowTime;
    const dt60 = deltaMs / (1000 / 60);

    if (isStainingCard) {
      octx.clearRect(0, 0, offCanvas.width, offCanvas.height);
      for (let stain of activeCardStains) {
        stain.update(dt60);
        stain.draw(octx);
      }

      sctx.clearRect(0, 0, cardStainCanvas.width, cardStainCanvas.height);
      sctx.drawImage(offCanvas, 0, 0);
    }
    requestAnimationFrame(renderCardStainLoop);
  }
  renderCardStainLoop();

  // ==========================================================================
  // --- 4. THREE.JS 3D WebGL Engine with Frame-Rate Independent Stream ---
  // ==========================================================================
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.z = 900;

  const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
  scene.add(ambientLight);

  const guindaPointLight = new THREE.PointLight(0x8c0014, 4.0, 1200);
  guindaPointLight.position.set(0, 0, 450);
  scene.add(guindaPointLight);

  const specularLight = new THREE.DirectionalLight(0x9e1026, 1.6);
  specularLight.position.set(300, 600, 500);
  scene.add(specularLight);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function screenTo3D(screenX, screenY, targetZ = 0) {
    const vec = new THREE.Vector3(
      (screenX / window.innerWidth) * 2 - 1,
      -(screenY / window.innerHeight) * 2 + 1,
      0.5
    );
    vec.unproject(camera);
    vec.sub(camera.position).normalize();
    const distance = (targetZ - camera.position.z) / vec.z;
    return camera.position.clone().add(vec.multiplyScalar(distance));
  }

  // Deep Guinda (Dark Cherry Maroon) 3D Blood Material
  const guindaBloodMaterial = new THREE.MeshPhongMaterial({
    color: 0x42000c,
    emissive: 0x1d0005,
    specular: 0x8a001a,
    shininess: 190,
    transparent: true,
    opacity: 0.98
  });

  const sphereGeo = new THREE.SphereGeometry(1, 24, 24);

  let active3DStreamGroup = new THREE.Group();
  scene.add(active3DStreamGroup);

  let active3DDroplets = [];
  let is3DFlyingActive = false;
  let hasExplodedOnCard = false;
  let streamProgress = 0;
  let streamTailProgress = 0;
  let streamSpawnAccumulator = 0;

  let start3DPos = new THREE.Vector3();
  let end3DPos = new THREE.Vector3();
  let control3DPos = new THREE.Vector3();

  // Subtle 3D Blood Droplet Burst at Bite Puncture Impact Point
  function trigger3DBiteImpactBurst(screenX, screenY) {
    const biteOrigin3D = screenTo3D(screenX, screenY, 60);

    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(sphereGeo, guindaBloodMaterial);
      mesh.position.copy(biteOrigin3D);

      const radius = 3 + Math.random() * 6;
      mesh.scale.set(radius, radius, radius);

      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        (Math.random() - 0.2) * speed,
        (Math.random() - 0.3) * 6 + 2
      );

      active3DStreamGroup.add(mesh);
      active3DDroplets.push({
        mesh,
        velocity,
        alpha: 1,
        baseScale: { x: radius, y: radius, z: radius },
        scaleMultiplier: 1.0,
        type: 'bite_burst'
      });
    }
  }

  function trigger3DDeformingStream(startX, startY, endX, endY) {
    while (active3DStreamGroup.children.length > 0) {
      const obj = active3DStreamGroup.children[0];
      active3DStreamGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    active3DDroplets = [];

    start3DPos = screenTo3D(startX, startY, 60);
    end3DPos = screenTo3D(endX, endY, 80);

    control3DPos = new THREE.Vector3(
      (start3DPos.x + end3DPos.x) / 2 + 120,
      (start3DPos.y + end3DPos.y) / 2 + 160,
      100
    );

    streamProgress = 0;
    streamTailProgress = 0;
    streamSpawnAccumulator = 0;
    hasExplodedOnCard = false;
    is3DFlyingActive = true;

    // Initial Bite Eruption 3D Droplets
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(sphereGeo, guindaBloodMaterial);
      mesh.position.copy(start3DPos);

      const radius = 4 + Math.random() * 8;
      mesh.scale.set(radius, radius, radius);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.2) * 14,
        (Math.random() - 0.5) * 10 + 3
      );

      active3DStreamGroup.add(mesh);
      active3DDroplets.push({
        mesh,
        velocity,
        alpha: 1,
        baseScale: { x: radius, y: radius, z: radius },
        scaleMultiplier: 1.0,
        type: 'burst'
      });
    }
  }

  function trigger3DFrontImpactExplosion() {
    for (let i = 0; i < 32; i++) {
      const mesh = new THREE.Mesh(sphereGeo, guindaBloodMaterial);
      mesh.position.copy(end3DPos);

      const radius = 5 + Math.random() * 10;
      mesh.scale.set(radius, radius, radius);

      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        (Math.random() - 0.2) * 8 + 3
      );

      active3DStreamGroup.add(mesh);
      active3DDroplets.push({
        mesh,
        velocity,
        alpha: 1,
        baseScale: { x: radius, y: radius, z: radius },
        scaleMultiplier: 1.0,
        type: 'impact'
      });
    }
  }

  let lastFrameTime = performance.now();

  function update3DFlyingEngine(nowTime) {
    if (!nowTime) nowTime = performance.now();
    const deltaMs = Math.min(nowTime - lastFrameTime, 64);
    lastFrameTime = nowTime;
    
    // Normalization ratio: 1.0 = 60 FPS (16.67ms), 0.416 = 144 FPS, 0.25 = 240 FPS
    const dt60 = deltaMs / (1000 / 60);
    const time = nowTime * 0.008;

    if (is3DFlyingActive) {
      if (streamProgress < 1) {
        // Delta-time normalized stream progress advancement (Exact 60 FPS timing on 144/240Hz)
        streamProgress += 0.038 * dt60;
        if (streamProgress >= 1) {
          streamProgress = 1;
          
          if (!hasExplodedOnCard) {
            hasExplodedOnCard = true;
            trigger3DFrontImpactExplosion();
            triggerCardBloodStaining();
            pactoCard.classList.add('absorbing');
          }
        }

        const t = streamProgress;
        const invT = 1 - t;
        const headX = invT * invT * start3DPos.x + 2 * invT * t * control3DPos.x + t * t * end3DPos.x;
        const headY = invT * invT * start3DPos.y + 2 * invT * t * control3DPos.y + t * t * end3DPos.y;
        const headZ = invT * invT * start3DPos.z + 2 * invT * t * control3DPos.z + t * t * end3DPos.z;

        // Frame-rate independent droplet spawn accumulator
        streamSpawnAccumulator += 4 * dt60;
        while (streamSpawnAccumulator >= 1) {
          streamSpawnAccumulator -= 1;

          const mesh = new THREE.Mesh(sphereGeo, guindaBloodMaterial);
          const k = Math.random() * Math.PI * 2;
          const wobbleX = Math.sin(time * 3 + k) * 14;
          const wobbleY = Math.cos(time * 3 + k) * 14;
          
          mesh.position.set(headX + wobbleX, headY + wobbleY, headZ + (Math.random() - 0.5) * 18);

          const rx = 8 + Math.sin(time * 5 + k) * 6;
          const ry = 12 + Math.cos(time * 5 + k) * 6;
          const rz = 8 + Math.sin(time * 4 + k) * 4;

          const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4,
            (Math.random() - 0.5) * 4
          );

          active3DStreamGroup.add(mesh);
          active3DDroplets.push({
            mesh,
            velocity,
            alpha: 1,
            baseScale: { x: rx, y: ry, z: rz },
            scaleMultiplier: 1.0,
            type: 'stream',
            phase: Math.random() * Math.PI * 2
          });
        }

      } else {
        streamTailProgress += 0.05 * dt60;
        if (streamTailProgress >= 1) {
          streamTailProgress = 1;
          is3DFlyingActive = false;
        }
      }
    }

    // Update particles with Delta Time & Non-exponential Scaling
    for (let i = active3DDroplets.length - 1; i >= 0; i--) {
      const item = active3DDroplets[i];

      // Position update scaled by dt60
      item.mesh.position.x += item.velocity.x * dt60;
      item.mesh.position.y += item.velocity.y * dt60;
      item.mesh.position.z += item.velocity.z * dt60;

      // Gravity scaled by dt60
      item.velocity.y -= 0.35 * dt60;

      // Shrink multiplier & Alpha fade scaled by dt60
      item.scaleMultiplier *= Math.pow(0.95, dt60);
      item.alpha -= 0.03 * dt60;

      if (item.type === 'stream') {
        // Absolute deformation calculation prevents exponential oval stretching at 144/240Hz!
        const deform = 1 + Math.sin(time * 6 + item.phase) * 0.25;
        const sx = item.baseScale.x * item.scaleMultiplier * deform;
        const sy = item.baseScale.y * item.scaleMultiplier / deform;
        const sz = item.baseScale.z * item.scaleMultiplier;
        item.mesh.scale.set(sx, sy, sz);
      } else {
        const s = (item.baseScale ? item.baseScale.x : 1.0) * item.scaleMultiplier;
        item.mesh.scale.set(s, s, s);
      }

      if (item.alpha <= 0 || item.scaleMultiplier < 0.05) {
        active3DStreamGroup.remove(item.mesh);
        if (item.mesh.geometry) item.mesh.geometry.dispose();
        active3DDroplets.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(update3DFlyingEngine);
  }
  update3DFlyingEngine();

  // ==========================================================================
  // --- 5. MASTER ANIMATION SEQUENCER FOR REGISTERED CARDS ---
  // ==========================================================================
  function playCardAnimation(cardId) {
    if (isPlaying) return;
    const cardData = CARD_ANIMATION_REGISTRY[cardId];
    if (!cardData) return;

    isPlaying = true;
    playBtn.disabled = true;
    labPlayBtn.disabled = true;

    resetCardState();

    setTimeout(() => {
      cardData.playAnimation();
      masterTl.timeScale(animationSpeed);
      masterTl.play(0);
    }, 100);
  }

  function executePactoDeSangreAnimation() {
    masterTl = gsap.timeline({
      paused: true,
      onComplete: () => {
        isPlaying = false;
        playBtn.disabled = false;
        labPlayBtn.disabled = false;

        // Loop mode playback support
        if (loopToggle.checked) {
          setTimeout(() => {
            if (loopToggle.checked) playCardAnimation(activeCardId);
          }, 1200);
        }
      }
    });

    const getRect = (el) => el.getBoundingClientRect();
    const heartRect = getRect(diamondBadge);
    const cardRect = getRect(pactoCard);
    const stageRect = getRect(stageZone);
    const hudRect = getRect(lifeContainer);

    const startX = heartRect.left + heartRect.width / 2;
    const startY = heartRect.top + heartRect.height / 2;

    // PHASE 1: Card Lift & Gap Closure (0.0s - 0.4s)
    masterTl
      .to(vignette, { opacity: 0.95, duration: 0.3, ease: 'power2.out' })
      
      .add(() => {
        const rect = pactoCard.getBoundingClientRect();
        
        const spacer = document.createElement('div');
        spacer.style.width = rect.width + 'px';
        spacer.style.height = rect.height + 'px';
        spacer.style.flexShrink = '0';
        handCards.insertBefore(spacer, pactoCard);
        
        pactoCard.style.position = 'fixed';
        pactoCard.style.left = rect.left + 'px';
        pactoCard.style.top = rect.top + 'px';
        pactoCard.style.zIndex = '50';
        pactoCard.style.margin = '0';
        pactoCard.style.transform = 'none';
        arena.appendChild(pactoCard);
        
        gsap.to(spacer, {
          width: 0,
          marginLeft: '-16px',
          marginRight: 0,
          opacity: 0,
          duration: 0.35,
          ease: 'power2.out',
          onComplete: () => spacer.remove()
        });
        
        const sRect = stageZone.getBoundingClientRect();
        const targetLeft = sRect.left + (sRect.width - rect.width) / 2;
        const targetTop = sRect.top + (sRect.height - rect.height) / 2;
        
        gsap.to(pactoCard, {
          left: targetLeft,
          top: targetTop,
          scale: 1.12,
          duration: 0.4,
          ease: 'power2.out'
        });
      }, 0)

      .to(pactoCard, {
        y: `+=6`,
        duration: 0.4,
        yoyo: true,
        repeat: 1,
        ease: 'sine.inOut'
      }, 0.4)

      .add(() => {
        vampireBite.classList.add('active');
      }, 0.0)
      .add(() => {
        vampireBite.classList.add('biting');
        lifeContainer.classList.add('corrupted');
        lifeValueEl.classList.add('damaged');
        trigger3DBiteImpactBurst(startX, startY);
      }, 0.05)

      .to(damagePopup, {
        opacity: 1,
        y: -45,
        scale: 1.3,
        duration: 0.25,
        ease: 'back.out(2)'
      }, 0.06)
      .to(damagePopup, {
        opacity: 0,
        y: -75,
        duration: 0.25,
        ease: 'power2.in'
      }, 0.38)

      .to({ val: 50 }, {
        val: 45,
        duration: 0.3,
        ease: 'power1.inOut',
        onUpdate: function() {
          lifeValueEl.textContent = Math.round(this.targets()[0].val);
        }
      }, 0.06)

      .add(() => {
        vampireBite.classList.remove('biting', 'active');
      }, 0.32)

      .add(() => {
        const currentCardRect = pactoCard.getBoundingClientRect();
        const endX = currentCardRect.left + currentCardRect.width / 2;
        const endY = currentCardRect.top + currentCardRect.height / 2;
        trigger3DDeformingStream(startX, startY, endX, endY);
      }, 0.22);

    // PHASE 2: STREAM IMPACT -> Card Staining & Shaking (0.44s - 0.74s)
    masterTl
      .to(pactoCard, {
        scale: 1.22,
        duration: 0.25,
        ease: 'power2.in'
      }, 0.44)
      .to(pactoCard, {
        rotation: 3,
        duration: 0.05,
        yoyo: true,
        repeat: 5,
        ease: 'rough'
      }, 0.44);

    // PHASE 3: Seamless Dissolve & Right-Side Card Draw Entry (0.74s - 1.2s)
    masterTl
      .to(pactoCard, {
        scale: 0,
        opacity: 0,
        filter: 'brightness(2.5) blur(16px)',
        duration: 0.28,
        ease: 'back.in(1.5)',
        onComplete: () => {
          pactoCard.style.display = 'none';
        }
      }, 0.74)
      .add(() => {
        lifeContainer.classList.remove('corrupted');
        lifeValueEl.classList.remove('damaged');
      }, 0.84)

      .add(() => {
        const newCard1 = document.createElement('div');
        newCard1.id = 'newCard1';
        newCard1.className = 'tcg-card dummy-card';
        newCard1.innerHTML = `<div class="dummy-inner">Carta Robada 1</div>`;
        handCards.appendChild(newCard1);
        
        newCard1.style.width = '140px';
        const targetRect1 = newCard1.getBoundingClientRect();
        
        newCard1.style.width = '0px';
        newCard1.style.marginLeft = '-16px';
        newCard1.style.opacity = '0';
        newCard1.style.padding = '0px';
        newCard1.style.borderWidth = '0px';
        newCard1.style.overflow = 'hidden';
        
        gsap.to(newCard1, {
          width: 140,
          marginLeft: 0,
          opacity: 0,
          padding: '',
          borderWidth: 1,
          duration: 0.45,
          ease: 'power2.out'
        });

        const flyingCard1 = document.createElement('div');
        flyingCard1.className = 'tcg-card dummy-card';
        flyingCard1.style.position = 'fixed';
        flyingCard1.style.left = `${hudRect.left + 50}px`;
        flyingCard1.style.top = `${hudRect.top - 20}px`;
        flyingCard1.style.zIndex = '35';
        flyingCard1.style.transform = 'scale(0.3)';
        flyingCard1.style.opacity = '0.9';
        flyingCard1.innerHTML = `<div class="dummy-inner">Carta Robada 1</div>`;
        arena.appendChild(flyingCard1);

        gsap.to(flyingCard1, {
          left: targetRect1.left,
          top: targetRect1.top,
          scale: 1,
          duration: 0.45,
          ease: 'power2.out',
          onComplete: () => {
            flyingCard1.remove();
            newCard1.style.opacity = '1';
            newCard1.style.overflow = '';
          }
        });
      }, 0.85)

      .add(() => {
        const newCard2 = document.createElement('div');
        newCard2.id = 'newCard2';
        newCard2.className = 'tcg-card dummy-card';
        newCard2.innerHTML = `<div class="dummy-inner">Carta Robada 2</div>`;
        handCards.appendChild(newCard2);
        
        newCard2.style.width = '140px';
        const targetRect2 = newCard2.getBoundingClientRect();
        
        newCard2.style.width = '0px';
        newCard2.style.marginLeft = '-16px';
        newCard2.style.opacity = '0';
        newCard2.style.padding = '0px';
        newCard2.style.borderWidth = '0px';
        newCard2.style.overflow = 'hidden';
        
        gsap.to(newCard2, {
          width: 140,
          marginLeft: 0,
          opacity: 0,
          padding: '',
          borderWidth: 1,
          duration: 0.45,
          ease: 'power2.out'
        });

        const flyingCard2 = document.createElement('div');
        flyingCard2.className = 'tcg-card dummy-card';
        flyingCard2.style.position = 'fixed';
        flyingCard2.style.left = `${hudRect.left + 50}px`;
        flyingCard2.style.top = `${hudRect.top - 20}px`;
        flyingCard2.style.zIndex = '35';
        flyingCard2.style.transform = 'scale(0.3)';
        flyingCard2.style.opacity = '0.9';
        flyingCard2.innerHTML = `<div class="dummy-inner">Carta Robada 2</div>`;
        arena.appendChild(flyingCard2);

        gsap.to(flyingCard2, {
          left: targetRect2.left,
          top: targetRect2.top,
          scale: 1,
          duration: 0.45,
          ease: 'power2.out',
          onComplete: () => {
            flyingCard2.remove();
            newCard2.style.opacity = '1';
            newCard2.style.overflow = '';
          }
        });
      }, 1.05)

      .to(vignette, { opacity: 0.6, duration: 0.35 }, 1.35);
  }

  // --- Reset Board State ---
  function resetCardState() {
    if (masterTl) masterTl.kill();
    isPlaying = false;
    playBtn.disabled = false;
    labPlayBtn.disabled = false;

    isStainingCard = false;
    activeCardStains = [];
    octx.clearRect(0, 0, offCanvas.width, offCanvas.height);
    sctx.clearRect(0, 0, cardStainCanvas.width, cardStainCanvas.height);

    is3DFlyingActive = false;
    hasExplodedOnCard = false;
    while (active3DStreamGroup.children.length > 0) {
      const obj = active3DStreamGroup.children[0];
      active3DStreamGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
    }
    active3DDroplets = [];

    pactoCard.style.display = 'block';
    pactoCard.style.position = 'relative';
    pactoCard.style.left = 'auto';
    pactoCard.style.top = 'auto';
    pactoCard.style.zIndex = '';
    pactoCard.style.margin = '';
    
    if (pactoCard.parentNode !== handCards) {
      handCards.insertBefore(pactoCard, card2);
    }

    gsap.set(pactoCard, {
      scale: 1,
      rotation: 0,
      opacity: 1,
      filter: 'none'
    });

    pactoCard.classList.remove('absorbing', 'filling');
    lifeContainer.classList.remove('corrupted');
    lifeValueEl.classList.remove('damaged');
    vampireBite.classList.remove('active', 'biting');
    lifeValueEl.textContent = '50';
    gsap.set(damagePopup, { opacity: 0, y: 0, scale: 0.8 });
    gsap.set(vignette, { opacity: 0.6 });

    // Reset drawn cards
    const cards = Array.from(handCards.children);
    cards.forEach(card => {
      if (card.id !== 'card1' && card.id !== 'card2' && card.id !== 'pactoCard') {
        card.remove();
      }
    });
  }

  // ==========================================================================
  // --- 6. CONTROLS & SIDEBAR EVENTS ---
  // ==========================================================================

  // Open / Close Laboratory Sidebar (Optional)
  if (labToggleBtn) {
    labToggleBtn.addEventListener('click', () => {
      labSidebar.classList.toggle('open');
    });
  }

  if (sidebarCloseBtn) {
    sidebarCloseBtn.addEventListener('click', () => {
      labSidebar.classList.remove('open');
    });
  }

  // Select Card from Menu List
  cardPresetsGrid.addEventListener('click', (e) => {
    const cardItem = e.target.closest('.preset-card-item');
    if (cardItem && cardItem.dataset.cardId && CARD_ANIMATION_REGISTRY[cardItem.dataset.cardId]) {
      activeCardId = cardItem.dataset.cardId;
      resetCardState();
    }
  });

  // Play Buttons
  playBtn.addEventListener('click', () => {
    playCardAnimation(activeCardId);
  });

  labPlayBtn.addEventListener('click', () => {
    playCardAnimation(activeCardId);
  });

  resetBtn.addEventListener('click', resetCardState);
  labResetBtn.addEventListener('click', resetCardState);

  // Speed Sliders Sync
  speedSlider.addEventListener('input', (e) => {
    animationSpeed = parseFloat(e.target.value);
    speedVal.textContent = `${animationSpeed.toFixed(1)}x`;
    sidebarSpeedSlider.value = animationSpeed;
    sidebarSpeedVal.textContent = `${animationSpeed.toFixed(1)}x`;
    if (masterTl) masterTl.timeScale(animationSpeed);
  });

  sidebarSpeedSlider.addEventListener('input', (e) => {
    animationSpeed = parseFloat(e.target.value);
    sidebarSpeedVal.textContent = `${animationSpeed.toFixed(1)}x`;
    speedSlider.value = animationSpeed;
    speedVal.textContent = `${animationSpeed.toFixed(1)}x`;
    if (masterTl) masterTl.timeScale(animationSpeed);
  });

});
