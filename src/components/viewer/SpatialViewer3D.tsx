import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useProjectStore, projectStore } from '../../store/useProjectStore';
import { getInterpolatedPosition } from '../../utils/interpolation';
import { Compass } from 'lucide-react';

export const SpatialViewer3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { project, currentFrame, selectedTrackId } = useProjectStore();

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitRef = useRef<OrbitControls | null>(null);
  const transformRef = useRef<TransformControls | null>(null);
  const sourceMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const dummyHeadRef = useRef<THREE.Group | null>(null);

  const [activeCameraMode, setActiveCameraMode] = useState<'perspective' | 'top' | 'front' | 'back'>('perspective');
  const isDraggingGizmoRef = useRef(false);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#14161b');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 2.8, 5.2);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.target.set(0, 0.3, -0.8);
    orbit.rotateSpeed = 0.9;
    orbit.panSpeed = 1.0;
    orbit.zoomSpeed = 1.2;

    // Configure MMD standard mouse button mapping:
    // - Right drag: Orbit / Rotate
    // - Middle drag (Wheel click): Pan / Translate
    // - Left drag: None (reserved for gizmo manipulation & track selection)
    orbit.mouseButtons = {
      LEFT: -1 as any,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };

    // MMD modifier key controls on Right Drag:
    // - Right Drag: Rotate (視点回転)
    // - Shift + Right Drag: Pan (視点水平移動)
    // - Ctrl / Cmd + Right Drag: Zoom / Dolly (拡大縮小)
    const onPointerDownCapture = (event: PointerEvent) => {
      if (event.button === 2) {
        if (event.ctrlKey || event.metaKey) {
          orbit.mouseButtons.RIGHT = THREE.MOUSE.DOLLY;
        } else {
          // If shiftKey is pressed, OrbitControls internally routes MOUSE.ROTATE to PAN
          orbit.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDownCapture, true);

    // Prevent default context menu on right click
    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    // Left click on sound source mesh to select track (MMD selection behavior)
    const raycaster = new THREE.Raycaster();
    const mouseCoord = new THREE.Vector2();
    const onCanvasPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || isDraggingGizmoRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      mouseCoord.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseCoord.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseCoord, camera);

      const meshes = Array.from(sourceMeshesRef.current.values());
      const intersects = raycaster.intersectObjects(meshes, false);
      if (intersects.length > 0) {
        const hitMesh = intersects[0].object as THREE.Mesh;
        const trackId = hitMesh.userData.trackId;
        if (trackId) {
          projectStore.selectTrack(trackId);
        }
      }
    };
    renderer.domElement.addEventListener('pointerdown', onCanvasPointerDown);

    orbitRef.current = orbit;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 7);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.5);
    fillLight.position.set(-5, 5, -5);
    scene.add(fillLight);

    // Helpers: Grid & Coordinates
    const gridHelper = new THREE.GridHelper(20, 20, 0x38bdf8, 0x272a34);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    // Axes helper: Red = +X, Green = +Y, Blue = +Z
    const axesHelper = new THREE.AxesHelper(2.0);
    axesHelper.position.set(0, -0.49, 0);
    scene.add(axesHelper);

    // Build stylized dummy head listener at (0, 0, 0) facing -Z (Forward)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0, 0);

    // Head sphere
    const headGeo = new THREE.SphereGeometry(0.2, 32, 24);
    headGeo.scale(1, 1.25, 1.1);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      roughness: 0.3,
      metalness: 0.2,
      wireframe: false,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headGroup.add(headMesh);

    // Nose pointer (-Z forward direction indicator)
    const noseGeo = new THREE.ConeGeometry(0.04, 0.12, 16);
    noseGeo.rotateX(-Math.PI / 2);
    noseGeo.translate(0, 0, -0.24);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x60a5fa });
    const noseMesh = new THREE.Mesh(noseGeo, noseMat);
    headGroup.add(noseMesh);

    // Left Ear (-0.0875, 0, 0)
    const earGeo = new THREE.SphereGeometry(0.045, 16, 16);
    const leftEarMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.3 });
    const leftEar = new THREE.Mesh(earGeo, leftEarMat);
    leftEar.position.set(-0.0875, 0, 0);
    headGroup.add(leftEar);

    // Right Ear (+0.0875, 0, 0)
    const rightEarMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xdc2626, emissiveIntensity: 0.3 });
    const rightEar = new THREE.Mesh(earGeo, rightEarMat);
    rightEar.position.set(0.0875, 0, 0);
    headGroup.add(rightEar);

    // Forward direction line (-Z forward)
    const forwardLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -0.2),
      new THREE.Vector3(0, 0, -1.5),
    ]);
    const forwardLineMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.1,
      gapSize: 0.05,
    });
    const forwardLine = new THREE.Line(forwardLineGeo, forwardLineMat);
    forwardLine.computeLineDistances();
    headGroup.add(forwardLine);

    scene.add(headGroup);
    dummyHeadRef.current = headGroup;

    // TransformControls for moving sound source
    const transform = new TransformControls(camera, renderer.domElement);
    transform.setMode('translate');
    transform.setSpace('world');
    transform.size = 0.8;

    transform.addEventListener('dragging-changed', (event: any) => {
      orbit.enabled = !Boolean(event.value);
      isDraggingGizmoRef.current = Boolean(event.value);
    });

    transform.addEventListener('objectChange', () => {
      const activeObj = transform.object;
      if (!activeObj || !activeObj.userData.trackId) return;

      const trackId = activeObj.userData.trackId;
      const curFrame = projectStore.getState().currentFrame;
      projectStore.addOrUpdateKeyframe(trackId, curFrame, {
        x: parseFloat(activeObj.position.x.toFixed(3)),
        y: parseFloat(activeObj.position.y.toFixed(3)),
        z: parseFloat(activeObj.position.z.toFixed(3)),
      });
    });

    scene.add(transform.getHelper());
    transformRef.current = transform;

    // Animation Loop
    let reqId: number;
    const animate = () => {
      reqId = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(reqId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDownCapture, true);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.domElement.removeEventListener('pointerdown', onCanvasPointerDown);
      orbit.dispose();
      transform.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update track sound source meshes and positions
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentMap = sourceMeshesRef.current;
    const activeTrackIds = new Set(project.tracks.map((t) => t.id));

    // Remove old meshes
    for (const [id, mesh] of currentMap.entries()) {
      if (!activeTrackIds.has(id)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
        currentMap.delete(id);
      }
    }

    // Update or create meshes for tracks
    for (const track of project.tracks) {
      let mesh = currentMap.get(track.id);
      if (!mesh) {
        const geo = new THREE.SphereGeometry(0.18, 32, 32);
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(track.color),
          emissive: new THREE.Color(track.color),
          emissiveIntensity: 0.2,
          roughness: 0.3,
          metalness: 0.4,
        });
        mesh = new THREE.Mesh(geo, mat);
        mesh.userData = { trackId: track.id };
        scene.add(mesh);
        currentMap.set(track.id, mesh);
      } else {
        // Update color
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(track.color);
        mat.emissive.set(track.color);
      }

      // If not currently dragging gizmo, update mesh position from interpolation
      if (!isDraggingGizmoRef.current || selectedTrackId !== track.id) {
        const pos = getInterpolatedPosition(track.keyframes, currentFrame);
        mesh.position.set(pos.x, pos.y, pos.z);
      }
    }

    // Attach/detach transform gizmo
    const transform = transformRef.current;
    if (transform) {
      if (selectedTrackId && currentMap.has(selectedTrackId)) {
        const targetMesh = currentMap.get(selectedTrackId)!;
        if (transform.object !== targetMesh) {
          transform.attach(targetMesh);
        }
      } else {
        transform.detach();
      }
    }
  }, [project.tracks, currentFrame, selectedTrackId]);

  // Camera presets
  const switchCameraView = (mode: 'perspective' | 'top' | 'front' | 'back') => {
    if (!cameraRef.current || !orbitRef.current) return;
    const camera = cameraRef.current;
    const orbit = orbitRef.current;
    setActiveCameraMode(mode);

    if (mode === 'top') {
      camera.position.set(0, 10, -0.0001);
      orbit.target.set(0, 0, 0);
      camera.up.set(0, 0, -1);
    } else if (mode === 'front') {
      camera.position.set(0, 0.5, -6.0);
      orbit.target.set(0, 0.5, 0);
      camera.up.set(0, 1, 0);
    } else if (mode === 'back') {
      camera.position.set(0, 0.5, 6.0);
      orbit.target.set(0, 0.5, 0);
      camera.up.set(0, 1, 0);
    } else {
      // Perspective
      camera.position.set(0, 2.8, 5.2);
      orbit.target.set(0, 0.3, -0.8);
      camera.up.set(0, 1, 0);
    }
    orbit.update();
  };

  const selectedTrack = project.tracks.find((t) => t.id === selectedTrackId);
  const currentPos = selectedTrack
    ? getInterpolatedPosition(selectedTrack.keyframes, currentFrame)
    : null;

  return (
    <div className="relative w-full h-full flex flex-col bg-dark-850 rounded-lg overflow-hidden border border-dark-700 select-none">
      {/* 3D Viewport Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-dark-800 border-b border-dark-700 text-xs text-slate-300 z-10">
        <div className="flex items-center space-x-2 font-medium">
          <Compass className="w-4 h-4 text-studio-accent" />
          <span>3D Binaural Spatial Viewer</span>
          {selectedTrack && (
            <span
              className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold"
              style={{ backgroundColor: `${selectedTrack.color}25`, color: selectedTrack.color }}
            >
              {selectedTrack.name}
            </span>
          )}
        </div>

        {/* Camera Preset Buttons */}
        <div className="flex items-center space-x-1 bg-dark-900/80 p-0.5 rounded border border-dark-700">
          <button
            onClick={() => switchCameraView('perspective')}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              activeCameraMode === 'perspective'
                ? 'bg-studio-accent text-dark-900 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="パースペクティブ視点 (後方見下ろし)"
          >
            パース
          </button>
          <button
            onClick={() => switchCameraView('front')}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              activeCameraMode === 'front'
                ? 'bg-studio-accent text-dark-900 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="正面視点 (Front)"
          >
            正面
          </button>
          <button
            onClick={() => switchCameraView('back')}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              activeCameraMode === 'back'
                ? 'bg-studio-accent text-dark-900 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="背面視点 (Back)"
          >
            背面
          </button>
          <button
            onClick={() => switchCameraView('top')}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              activeCameraMode === 'top'
                ? 'bg-studio-accent text-dark-900 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="上面視点 (Top-Down)"
          >
            上面
          </button>
        </div>
      </div>

      {/* 3D Canvas Canvas Container */}
      <div ref={containerRef} className="flex-1 relative cursor-default w-full h-full overflow-hidden" />

      {/* MMD Camera Operation Hint (Top Right) */}
      <div className="absolute top-10 right-2 z-10 bg-dark-900/85 backdrop-blur-sm px-2.5 py-1.5 rounded-md border border-dark-700/80 text-[10px] text-slate-300 shadow pointer-events-none hidden md:flex items-center space-x-2 font-mono">
        <span className="text-amber-400 font-semibold">MMD操作:</span>
        <span className="text-slate-400">右ドラッグ: <span className="text-slate-200">回転</span></span>
        <span className="text-dark-650">|</span>
        <span className="text-slate-400">中 / Shift+右: <span className="text-slate-200">移動</span></span>
        <span className="text-dark-650">|</span>
        <span className="text-slate-400">ホイール / Ctrl+右: <span className="text-slate-200">ズーム</span></span>
      </div>

      {/* 3D Spatial HUD Legend & Current Position Info */}
      <div className="absolute bottom-2 left-2 z-10 bg-dark-900/85 backdrop-blur-sm px-2.5 py-1.5 rounded-md border border-dark-700/80 text-[11px] space-y-1 shadow-lg pointer-events-none">
        <div className="flex items-center space-x-3 text-slate-400 font-mono">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-red-500 mr-1 inline-block" />X (左右)</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-green-500 mr-1 inline-block" />Y (上下)</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-1 inline-block" />Z (前後)</span>
        </div>
        <div className="flex items-center space-x-3 text-slate-400 font-mono text-[10px]">
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-1 inline-block" />L耳: -8.75cm</span>
          <span className="flex items-center"><span className="w-2 h-2 rounded-full bg-rose-500 mr-1 inline-block" />R耳: +8.75cm</span>
        </div>
      </div>

      {currentPos && (
        <div className="absolute bottom-2 right-2 z-10 bg-dark-900/85 backdrop-blur-sm px-3 py-1.5 rounded-md border border-dark-700/80 text-xs font-mono shadow-lg flex items-center space-x-3">
          <span className="text-slate-400">現在座標:</span>
          <span className="text-red-400 font-semibold">X: {currentPos.x.toFixed(2)}m</span>
          <span className="text-green-400 font-semibold">Y: {currentPos.y.toFixed(2)}m</span>
          <span className="text-blue-400 font-semibold">Z: {currentPos.z.toFixed(2)}m</span>
        </div>
      )}
    </div>
  );
};
