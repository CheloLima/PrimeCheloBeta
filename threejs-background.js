import * as THREE from 'three';

let scene, camera, renderer, stars;
const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.015, // Kleinere Sterne für einen subtileren Effekt
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});

const mouse = new THREE.Vector2();
const targetRotation = new THREE.Vector2(); // Zielrotation basierend auf Mausposition
const currentRotation = new THREE.Vector2(); // Aktuelle, geglättete Rotation

const rotationFactor = 0.00005; // Wie stark die Maus die Rotation beeinflusst
const dampingFactor = 0.05; // Wie schnell die Rotation zur Mausposition oder zum Zentrum zurückkehrt

export function initThreeJS(container) {
    // Szene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05080a, 0.0007); // Passend zum --bg-deep-space

    // Kamera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 1; // Kamera näher an den Sternen, um den Parallax-Effekt zu verstärken

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // alpha:true für transparenten Hintergrund, falls benötigt
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Performance-Optimierung für hohe DPI-Displays
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // Sterne erstellen
    createStars();

    // Event Listener
    window.addEventListener('resize', onWindowResize, false);
    document.addEventListener('mousemove', onMouseMove, false);

    // Animation starten
    animate();
}

function createStars() {
    const starGeometry = new THREE.BufferGeometry();
    const starVertices = [];
    const starCount = 15000; // Erhöhte Anzahl für dichteren Sternenhimmel

    for (let i = 0; i < starCount; i++) {
        const x = THREE.MathUtils.randFloatSpread(100); // Sterne weiter verteilen
        const y = THREE.MathUtils.randFloatSpread(100);
        const z = THREE.MathUtils.randFloatSpread(100); // Auch in Z-Richtung für Tiefe
        starVertices.push(x, y, z);
    }

    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starVertices, 3));
    stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
    // Mausposition normalisieren (-1 bis +1)
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Zielrotation basierend auf Mausposition setzen
    // Die Multiplikatoren hier bestimmen die maximale Auslenkung
    targetRotation.x = mouse.y * Math.PI * rotationFactor;
    targetRotation.y = mouse.x * Math.PI * rotationFactor;
}

function animate() {
    requestAnimationFrame(animate);

    // Glättung der Rotation (Lerp)
    currentRotation.x += (targetRotation.x - currentRotation.x) * dampingFactor;
    currentRotation.y += (targetRotation.y - currentRotation.y) * dampingFactor;

    // Sterne rotieren basierend auf der geglätteten Mausposition
    if (stars) {
        stars.rotation.x = currentRotation.x;
        stars.rotation.y = currentRotation.y;
    }

    // Eine subtile, langsame Grundrotation hinzufügen, damit es nicht statisch wirkt, wenn die Maus stillsteht
    if (stars) {
        stars.rotation.y += 0.00005;
    }


    renderer.render(scene, camera);
}
