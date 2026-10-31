import * as THREE from 'three'
import { OrbitControls } from './vendor/OrbitControls.js'

const viewport = document.querySelector('#viewport')
const loading = document.querySelector('#loading')
const errorBox = document.querySelector('#error')
const centerReadout = document.querySelector('#center-readout')
const tileReadout = document.querySelector('#tile-readout')
const vertexReadout = document.querySelector('#vertex-readout')
const settingsButton = document.querySelector('#settings-button')
const settingsPanel = document.querySelector('#settings-panel')
const settingsClose = document.querySelector('#settings-close')
const firstPersonToggle = document.querySelector('#first-person-toggle')
const mobileToggle = document.querySelector('#mobile-toggle')
const joystickSideButtons = document.querySelectorAll('[data-joystick-side]')
const mobileControls = document.querySelector('#mobile-controls')
const joystick = document.querySelector('#joystick')
const joystickKnob = document.querySelector('#joystick-knob')
const verticalButtons = document.querySelector('#vertical-buttons')
const jumpButton = document.querySelector('#jump-button')
const moveUpButton = document.querySelector('#move-up')
const moveDownButton = document.querySelector('#move-down')

const MAX_CONCURRENT_LOADS = 8
const PLAYER_HALF_WIDTH = 0.3
const PLAYER_HEIGHT = 1.8
const PLAYER_EYE_HEIGHT = 1.62
const PLAYER_WALK_SPEED = 4.4
const PLAYER_RUN_SPEED = 7.4
const PLAYER_JUMP_SPEED = 8.4
const PLAYER_VERTICAL_SPEED = 5.4
const PLAYER_GRAVITY = 26
const PLAYER_MOVE_STEP = 0.18
const COLLISION_EPSILON = 0.0001
const vertexFormatter = new Intl.NumberFormat('zh-CN')

let manifest
let renderer
let scene
let camera
let controls
let material
let schoolView
let resetView
let collision
let player
let savedOrbit
let firstPerson = false
let mobileMode = false
let joystickSide = 'left'
let lookPointerId = null
let joystickPointerId = null
let lookLastX = 0
let lookLastY = 0
let jumpQueued = false
let mobileVertical = 0
const tileGroup = new THREE.Group()
const loadedTiles = new Map()
const queuedTiles = new Set()
const tileQueue = []
const keys = new Set()
const mobileMove = { x: 0, y: 0 }
let activeLoads = 0
let totalLoadedVertices = 0
let allTilesRequested = false

function showError (error) {
  errorBox.hidden = false
  errorBox.textContent = error instanceof Error ? error.message : String(error)
  loading.classList.add('hidden')
}

function tileKey (tile) {
  return `${tile.x},${tile.z}`
}

function createRenderer () {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.outputEncoding = THREE.sRGBEncoding
  renderer.setClearColor(0xa8b8b1, 1)
  viewport.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0xa8b8b1)
  scene.fog = new THREE.Fog(0xa8b8b1, 360, 920)
  scene.add(tileGroup)

  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1400)
  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.minDistance = 12
  controls.maxDistance = 430
  controls.maxPolarAngle = Math.PI * 0.495
  controls.target.set(manifest.focus.x, manifest.focus.y + 16, manifest.focus.z)

  schoolView = new THREE.Vector3(manifest.focus.x, manifest.focus.y + 18, manifest.focus.z)
  const cameraOffset = new THREE.Vector3(152, 122, 152)
  camera.position.copy(schoolView).add(cameraOffset)
  resetView = {
    target: schoolView.clone(),
    position: camera.position.clone()
  }
  controls.update()
}

function loadAtlas () {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(manifest.atlas, texture => {
      texture.flipY = false
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestMipmapNearestFilter
      texture.wrapS = THREE.ClampToEdgeWrapping
      texture.wrapT = THREE.ClampToEdgeWrapping
      texture.generateMipmaps = true
      texture.encoding = THREE.sRGBEncoding
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
      resolve(texture)
    }, undefined, reject)
  })
}

function createPaletteTexture () {
  const data = new Uint8Array(256 * 4)
  for (let index = 0; index < 256; index++) {
    const source = index * 3
    const target = index * 4
    if (source + 2 < manifest.palette.length) {
      data[target] = manifest.palette[source]
      data[target + 1] = manifest.palette[source + 1]
      data[target + 2] = manifest.palette[source + 2]
    }
    data[target + 3] = 255
  }
  const texture = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

function createRectTexture () {
  const count = manifest.textureRects.length / 4
  const data = new Float32Array(manifest.textureRects)
  const texture = new THREE.DataTexture(data, count, 1, THREE.RGBAFormat, THREE.FloatType)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return { texture, count }
}

function parseTileGeometry (tile, buffer) {
  const view = new DataView(buffer)
  if (view.getUint32(0, false) !== 0x54334a53) {
    throw new Error(`区块格式错误：${tile.file}`)
  }
  if (view.getUint32(4, true) !== 4) {
    throw new Error(`不支持的区块格式版本：${tile.file}`)
  }

  const batchCount = view.getUint32(8, true)
  const vertexCount = view.getUint32(12, true)
  const indexCount = view.getUint32(16, true)
  const geometries = []
  let offset = 24

  for (let batch = 0; batch < batchCount; batch++) {
    const batchVertices = view.getUint32(offset, true)
    const batchIndices = view.getUint32(offset + 4, true)
    offset += 8

    const positionOffset = offset
    offset += batchVertices * 6
    const uvOffset = offset
    offset += batchVertices * 4
    const colorOffset = offset
    offset += batchVertices
    const textureIdOffset = offset
    offset += batchVertices * 2
    if (offset % 2) offset++
    const indexOffset = offset
    offset += batchIndices * 2

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Int16Array(buffer, positionOffset, batchVertices * 3), 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Uint16Array(buffer, uvOffset, batchVertices * 2), 2))
    geometry.setAttribute('colorIndex', new THREE.BufferAttribute(new Uint8Array(buffer, colorOffset, batchVertices), 1))
    geometry.setAttribute('textureId', new THREE.BufferAttribute(new Uint16Array(buffer, textureIdOffset, batchVertices), 1))
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(buffer, indexOffset, batchIndices), 1))
    geometry.computeBoundingSphere()
    geometries.push(geometry)
  }

  return { geometries, vertexCount, indexCount }
}

async function decompressTile (buffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持 DecompressionStream，无法解压网格')
  }
  const stream = new Response(buffer).body.pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

async function loadCollision () {
  const info = manifest.collision
  if (!info) throw new Error('世界清单缺少碰撞数据，请重新执行 npm run build:three')
  const requests = [fetch(info.file)]
  if (info.partials?.file) requests.push(fetch(info.partials.file))
  const [response, partialResponse] = await Promise.all(requests)
  if (!response.ok) throw new Error(`无法读取碰撞数据 ${info.file} (${response.status})`)
  const buffer = await decompressTile(await response.arrayBuffer())
  const expectedBytes = info.width * info.depth * info.wordsPerColumn * 4
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(`碰撞数据尺寸错误：${buffer.byteLength} / ${expectedBytes} 字节`)
  }
  const partials = new Map()
  if (partialResponse) {
    if (!partialResponse.ok) throw new Error(`无法读取半砖碰撞数据 (${partialResponse.status})`)
    const partialBuffer = await decompressTile(await partialResponse.arrayBuffer())
    const packed = new Uint32Array(partialBuffer)
    const columnHeight = info.maxY - info.minY + 1
    for (let index = 0; index < packed.length; index++) {
      const value = packed[index]
      const shape = value & 1
      const y = (value >>> 2) & 0xff
      const z = (value >>> 10) & 0x3ff
      const x = (value >>> 20) & 0x3ff
      partials.set((z * info.width + x) * columnHeight + y, shape)
    }
  }
  collision = {
    ...info,
    data: new Uint32Array(buffer),
    partials
  }
}

async function loadTile (tile) {
  queuedTiles.delete(tileKey(tile))
  if (loadedTiles.has(tileKey(tile))) return
  activeLoads++
  try {
    const response = await fetch(tile.file)
    if (!response.ok) throw new Error(`无法读取 ${tile.file} (${response.status})`)
    const parsed = parseTileGeometry(tile, await decompressTile(await response.arrayBuffer()))
    const group = new THREE.Group()
    for (const geometry of parsed.geometries) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.scale.setScalar(1 / 16)
      group.add(mesh)
    }
    group.position.set(tile.minX, 0, tile.minZ)
    tileGroup.add(group)
    loadedTiles.set(tileKey(tile), group)
    totalLoadedVertices += parsed.vertexCount
    updateReadouts()
  } catch (error) {
    showError(error)
  } finally {
    activeLoads--
    pumpQueue()
    updateReadouts()
  }
}

function pumpQueue () {
  while (activeLoads < MAX_CONCURRENT_LOADS && tileQueue.length > 0) {
    const tile = tileQueue.shift()
    if (!tile || loadedTiles.has(tileKey(tile)) || !queuedTiles.has(tileKey(tile))) continue
    loadTile(tile)
  }
}

function requestTile (tile) {
  const key = tileKey(tile)
  if (loadedTiles.has(key) || queuedTiles.has(key)) return
  queuedTiles.add(key)
  tileQueue.push(tile)
  pumpQueue()
}

function loadAllTiles () {
  if (allTilesRequested || !manifest) return
  allTilesRequested = true
  const centerX = controls.target.x
  const centerZ = controls.target.z
  const sorted = manifest.tiles.slice().sort((a, b) => {
    const aDistance = (a.minX + manifest.tileSize / 2 - centerX) ** 2 + (a.minZ + manifest.tileSize / 2 - centerZ) ** 2
    const bDistance = (b.minX + manifest.tileSize / 2 - centerX) ** 2 + (b.minZ + manifest.tileSize / 2 - centerZ) ** 2
    return aDistance - bDistance
  })
  for (const tile of sorted) requestTile(tile)
  updateReadouts()
}

function updateReadouts () {
  if (!controls) return
  centerReadout.textContent = firstPerson && player
    ? `${Math.round(player.position.x)}, ${Math.round(player.position.z)}`
    : `${Math.round(controls.target.x)}, ${Math.round(controls.target.z)}`
  tileReadout.textContent = `${loadedTiles.size} / ${manifest.tiles.length}`
  vertexReadout.textContent = vertexFormatter.format(totalLoadedVertices)
  if (!loading.classList.contains('hidden')) {
    if (loadedTiles.size >= manifest.tiles.length && activeLoads === 0 && queuedTiles.size === 0) {
      loading.classList.add('hidden')
    } else {
      loading.textContent = `正在加载完整学校 ${loadedTiles.size} / ${manifest.tiles.length}`
    }
  }
}

function moveTarget (delta) {
  controls.target.add(delta)
  camera.position.add(delta)
}

function setView (name) {
  if (name === 'school' || name === 'reset') {
    controls.target.copy(resetView.target)
    camera.position.copy(resetView.position)
  } else if (name === 'spawn') {
    const target = new THREE.Vector3(manifest.spawn.x, manifest.focus.y + 18, manifest.spawn.z)
    controls.target.copy(target)
    camera.position.copy(target).add(new THREE.Vector3(110, 88, 110))
  } else if (name === 'top') {
    const target = controls.target.clone()
    controls.target.set(resetView.target.x, resetView.target.y, resetView.target.z)
    camera.position.set(resetView.target.x + 0.01, resetView.target.y + 285, resetView.target.z + 0.01)
  }
  controls.update()
}

function updateControlUi () {
  firstPersonToggle.textContent = firstPerson ? '开启' : '关闭'
  firstPersonToggle.setAttribute('aria-pressed', String(firstPerson))
  mobileToggle.textContent = mobileMode ? '开启' : '关闭'
  mobileToggle.setAttribute('aria-pressed', String(mobileMode))
  mobileControls.hidden = !mobileMode
  mobileControls.dataset.side = joystickSide
  verticalButtons.hidden = !(mobileMode && firstPerson)
  joystickSideButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.joystickSide === joystickSide)
  })
  document.body.classList.toggle('first-person', firstPerson)
  document.body.classList.toggle('mobile-mode', mobileMode)
}

function ensurePlayer () {
  if (player) return
  const spawn = manifest.player || {
    x: manifest.focus.x,
    y: manifest.focus.y + 20,
    z: manifest.focus.z
  }
  player = {
    position: new THREE.Vector3(spawn.x, spawn.y, spawn.z),
    velocityY: 0,
    onGround: false,
    yaw: 0,
    pitch: 0
  }
  for (let attempt = 0; collision && attempt < 80 && collides(player.position.x, player.position.y, player.position.z); attempt++) {
    player.position.y += 0.25
  }
  const groundY = findGroundTop(player.position.x, player.position.z, player.position.y)
  if (groundY !== null && groundY <= player.position.y + 2) {
    player.position.y = groundY
  }
}

function isSolidAt (blockX, blockY, blockZ) {
  if (!collision) return false
  const x = blockX - collision.minX
  const z = blockZ - collision.minZ
  const y = blockY - collision.minY
  if (x < 0 || x >= collision.width || z < 0 || z >= collision.depth) return false
  if (y < 0 || y >= collision.maxY - collision.minY + 1) return false
  const index = ((z * collision.width + x) * collision.wordsPerColumn) + (y >> 5)
  return (collision.data[index] & (1 << (y & 31))) !== 0
}

function collisionKindAt (blockX, blockY, blockZ) {
  if (isSolidAt(blockX, blockY, blockZ)) return 0
  if (!collision.partials.size) return -1
  const x = blockX - collision.minX
  const z = blockZ - collision.minZ
  const y = blockY - collision.minY
  if (x < 0 || x >= collision.width || z < 0 || z >= collision.depth) return -1
  if (y < 0 || y >= collision.maxY - collision.minY + 1) return -1
  const shape = collision.partials.get((z * collision.width + x) * (collision.maxY - collision.minY + 1) + y)
  return shape === undefined ? -1 : shape + 1
}

function findGroundTop (x, z, fromY) {
  if (!collision) return null
  const blockX = Math.floor(x)
  const blockZ = Math.floor(z)
  for (let blockY = Math.floor(fromY); blockY >= collision.minY; blockY--) {
    const kind = collisionKindAt(blockX, blockY, blockZ)
    if (kind === 0) return blockY + 1
    if (kind === 1) return blockY + 0.5
    if (kind === 2) return blockY + 1
  }
  return null
}

function collides (x, feetY, z) {
  if (!collision) return false
  const minX = Math.floor(x - PLAYER_HALF_WIDTH + COLLISION_EPSILON)
  const maxX = Math.floor(x + PLAYER_HALF_WIDTH - COLLISION_EPSILON)
  const minY = Math.floor(feetY + COLLISION_EPSILON)
  const maxY = Math.floor(feetY + PLAYER_HEIGHT - COLLISION_EPSILON)
  const minZ = Math.floor(z - PLAYER_HALF_WIDTH + COLLISION_EPSILON)
  const maxZ = Math.floor(z + PLAYER_HALF_WIDTH - COLLISION_EPSILON)
  for (let blockY = minY; blockY <= maxY; blockY++) {
    for (let blockZ = minZ; blockZ <= maxZ; blockZ++) {
      for (let blockX = minX; blockX <= maxX; blockX++) {
        const kind = collisionKindAt(blockX, blockY, blockZ)
        if (kind === 0) return true
        if (kind === 1 && feetY < blockY + 0.5 - COLLISION_EPSILON) return true
        if (kind === 2 && feetY + PLAYER_HEIGHT > blockY + 0.5 + COLLISION_EPSILON) return true
      }
    }
  }
  return false
}

function movePlayerAxis (axis, amount) {
  if (!player || !Number.isFinite(amount) || Math.abs(amount) < 0.000001) return false
  if (!collision) {
    player.position[axis] += amount
    return false
  }
  const direction = Math.sign(amount)
  let remaining = Math.abs(amount)
  while (remaining > 0.000001) {
    const distance = Math.min(remaining, PLAYER_MOVE_STEP)
    const nextX = player.position.x + (axis === 'x' ? direction * distance : 0)
    const nextY = player.position.y + (axis === 'y' ? direction * distance : 0)
    const nextZ = player.position.z + (axis === 'z' ? direction * distance : 0)
    if (!collides(nextX, nextY, nextZ)) {
      player.position[axis] += direction * distance
      remaining -= distance
      continue
    }

    let safe = 0
    let blocked = distance
    for (let iteration = 0; iteration < 7; iteration++) {
      const middle = (safe + blocked) * 0.5
      const testX = player.position.x + (axis === 'x' ? direction * middle : 0)
      const testY = player.position.y + (axis === 'y' ? direction * middle : 0)
      const testZ = player.position.z + (axis === 'z' ? direction * middle : 0)
      if (collides(testX, testY, testZ)) blocked = middle
      else safe = middle
    }
    player.position[axis] += direction * safe
    if (axis === 'y') {
      if (direction < 0) player.onGround = true
      player.velocityY = 0
    }
    return true
  }
  return false
}

function updateFirstPersonCamera () {
  if (!player) return
  camera.position.set(player.position.x, player.position.y + PLAYER_EYE_HEIGHT, player.position.z)
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ')
}

function setFirstPerson (enabled) {
  enabled = Boolean(enabled)
  if (!camera || enabled === firstPerson) {
    updateControlUi()
    return
  }
  if (enabled) {
    savedOrbit = {
      position: camera.position.clone(),
      target: controls.target.clone()
    }
    ensurePlayer()
    player.velocityY = 0
    player.onGround = false
    firstPerson = true
    controls.enabled = false
    updateFirstPersonCamera()
  } else {
    firstPerson = false
    controls.enabled = true
    lookPointerId = null
    joystickPointerId = null
    jumpQueued = false
    mobileVertical = 0
    mobileMove.x = 0
    mobileMove.y = 0
    resetJoystick()
    if (savedOrbit) {
      camera.position.copy(savedOrbit.position)
      controls.target.copy(savedOrbit.target)
      savedOrbit = null
    }
    controls.update()
    if (mobileMode) {
      mobileMode = false
      mobileMove.x = 0
      mobileMove.y = 0
    }
  }
  updateControlUi()
}

function applyJoystickSide (side) {
  joystickSide = side === 'right' ? 'right' : 'left'
  updateControlUi()
}

function setMobileMode (enabled) {
  mobileMode = Boolean(enabled)
  if (mobileMode) {
    setFirstPerson(true)
  } else {
    joystickPointerId = null
    mobileMove.x = 0
    mobileMove.y = 0
    mobileVertical = 0
    resetJoystick()
  }
  updateControlUi()
}

function updateJoystick (clientX, clientY) {
  const rect = joystick.getBoundingClientRect()
  const centerX = rect.left + rect.width * 0.5
  const centerY = rect.top + rect.height * 0.5
  const maxDistance = Math.max(1, rect.width * 0.3)
  let dx = clientX - centerX
  let dy = clientY - centerY
  const distance = Math.hypot(dx, dy)
  if (distance > maxDistance) {
    const scale = maxDistance / distance
    dx *= scale
    dy *= scale
  }
  mobileMove.x = dx / maxDistance
  mobileMove.y = dy / maxDistance
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`
}

function resetJoystick () {
  mobileMove.x = 0
  mobileMove.y = 0
  joystickKnob.style.transform = ''
}

function bindLookControls () {
  const canvas = renderer.domElement
  canvas.addEventListener('pointerdown', event => {
    if (!firstPerson || lookPointerId !== null) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    lookPointerId = event.pointerId
    lookLastX = event.clientX
    lookLastY = event.clientY
    canvas.setPointerCapture(event.pointerId)
    event.preventDefault()
  })
  canvas.addEventListener('pointermove', event => {
    if (!firstPerson || event.pointerId !== lookPointerId) return
    const dx = event.clientX - lookLastX
    const dy = event.clientY - lookLastY
    const sensitivity = event.pointerType === 'touch' ? 0.0045 : 0.0032
    player.yaw -= dx * sensitivity
    player.pitch = Math.max(-1.52, Math.min(1.52, player.pitch - dy * sensitivity))
    lookLastX = event.clientX
    lookLastY = event.clientY
    updateFirstPersonCamera()
    event.preventDefault()
  })
  const releaseLook = event => {
    if (event.pointerId !== lookPointerId) return
    lookPointerId = null
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }
  canvas.addEventListener('pointerup', releaseLook)
  canvas.addEventListener('pointercancel', releaseLook)
  canvas.addEventListener('lostpointercapture', event => {
    if (event.pointerId === lookPointerId) lookPointerId = null
  })
}

function bindHoldButton (button, onPress, onRelease = () => {}) {
  let pointerId = null
  const release = event => {
    if (pointerId === null || event.pointerId !== pointerId) return
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId)
    pointerId = null
    button.classList.remove('pressed')
    onRelease()
    event.preventDefault()
    event.stopPropagation()
  }
  button.addEventListener('pointerdown', event => {
    if (pointerId !== null) return
    pointerId = event.pointerId
    button.setPointerCapture(event.pointerId)
    button.classList.add('pressed')
    onPress()
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
  button.addEventListener('lostpointercapture', event => {
    if (pointerId !== event.pointerId) return
    pointerId = null
    button.classList.remove('pressed')
    onRelease()
  })
}

function bindUi () {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.view))
  })

  settingsButton.addEventListener('click', () => {
    const open = settingsPanel.hidden
    settingsPanel.hidden = !open
    settingsButton.setAttribute('aria-expanded', String(open))
  })
  settingsClose.addEventListener('click', () => {
    settingsPanel.hidden = true
    settingsButton.setAttribute('aria-expanded', 'false')
  })
  firstPersonToggle.addEventListener('click', () => setFirstPerson(!firstPerson))
  mobileToggle.addEventListener('click', () => setMobileMode(!mobileMode))
  joystickSideButtons.forEach(button => {
    button.addEventListener('click', () => applyJoystickSide(button.dataset.joystickSide))
  })

  bindLookControls()
  joystick.addEventListener('pointerdown', event => {
    if (!mobileMode || !firstPerson || joystickPointerId !== null) return
    joystickPointerId = event.pointerId
    joystick.setPointerCapture(event.pointerId)
    updateJoystick(event.clientX, event.clientY)
    event.preventDefault()
    event.stopPropagation()
  })
  joystick.addEventListener('pointermove', event => {
    if (event.pointerId !== joystickPointerId) return
    updateJoystick(event.clientX, event.clientY)
    event.preventDefault()
    event.stopPropagation()
  })
  const releaseJoystick = event => {
    if (event.pointerId !== joystickPointerId) return
    joystickPointerId = null
    if (joystick.hasPointerCapture(event.pointerId)) joystick.releasePointerCapture(event.pointerId)
    resetJoystick()
    event.preventDefault()
    event.stopPropagation()
  }
  joystick.addEventListener('pointerup', releaseJoystick)
  joystick.addEventListener('pointercancel', releaseJoystick)
  joystick.addEventListener('lostpointercapture', event => {
    if (event.pointerId !== joystickPointerId) return
    joystickPointerId = null
    resetJoystick()
  })

  bindHoldButton(jumpButton, () => { jumpQueued = true })
  bindHoldButton(moveUpButton, () => { mobileVertical = 1 }, () => {
    if (mobileVertical > 0) mobileVertical = 0
  })
  bindHoldButton(moveDownButton, () => { mobileVertical = -1 }, () => {
    if (mobileVertical < 0) mobileVertical = 0
  })

  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' && !settingsPanel.hidden) {
      settingsPanel.hidden = true
      settingsButton.setAttribute('aria-expanded', 'false')
      return
    }
    if (event.code === 'Space' && firstPerson) {
      if (!event.repeat) jumpQueued = true
      event.preventDefault()
      return
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      keys.add(event.code)
      event.preventDefault()
    }
  })
  window.addEventListener('keyup', event => keys.delete(event.code))
  window.addEventListener('blur', () => {
    keys.clear()
    jumpQueued = false
    mobileVertical = 0
    resetJoystick()
  })
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
  updateControlUi()
}

function updateMovement (delta) {
  if (!firstPerson) {
    if (keys.size === 0) return
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 72 : 26) * delta
    const forward = new THREE.Vector3()
    camera.getWorldDirection(forward)
    forward.y = 0
    forward.normalize()
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize()
    const movement = new THREE.Vector3()

    if (keys.has('KeyW')) movement.add(forward)
    if (keys.has('KeyS')) movement.sub(forward)
    if (keys.has('KeyD')) movement.add(right)
    if (keys.has('KeyA')) movement.sub(right)
    if (keys.has('KeyE')) movement.y += 1
    if (keys.has('KeyQ')) movement.y -= 1
    if (movement.lengthSq() > 0) moveTarget(movement.normalize().multiplyScalar(speed))
    return
  }

  ensurePlayer()
  let forwardInput = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) - mobileMove.y
  let rightInput = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + mobileMove.x
  const inputLength = Math.hypot(forwardInput, rightInput)
  if (inputLength > 0.0001) {
    if (inputLength > 1) {
      forwardInput /= inputLength
      rightInput /= inputLength
    }
    const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED
    const forwardX = -Math.sin(player.yaw)
    const forwardZ = -Math.cos(player.yaw)
    const rightX = Math.cos(player.yaw)
    const rightZ = -Math.sin(player.yaw)
    const dx = (forwardX * forwardInput + rightX * rightInput) * speed * delta
    const dz = (forwardZ * forwardInput + rightZ * rightInput) * speed * delta
    movePlayerAxis('x', dx)
    movePlayerAxis('z', dz)
  }

  const keyVertical = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0)
  const verticalInput = Math.max(-1, Math.min(1, keyVertical + (mobileMode ? mobileVertical : 0)))
  const canJump = player.onGround
  player.onGround = false
  if (jumpQueued && canJump && verticalInput === 0) {
    player.velocityY = PLAYER_JUMP_SPEED
  }
  jumpQueued = false

  if (verticalInput !== 0) {
    player.velocityY = 0
    movePlayerAxis('y', verticalInput * PLAYER_VERTICAL_SPEED * delta)
  } else {
    player.velocityY -= PLAYER_GRAVITY * delta
    movePlayerAxis('y', player.velocityY * delta)
  }
}

function animate () {
  window.requestAnimationFrame(animate)
  const delta = Math.min(0.06, Math.max(0, (performance.now() - animate.last) / 1000 || 0))
  animate.last = performance.now()
  updateMovement(delta)
  if (firstPerson) updateFirstPersonCamera()
  else controls.update()
  if (performance.now() - (animate.lastReadout || 0) > 200) {
    animate.lastReadout = performance.now()
    centerReadout.textContent = firstPerson && player
      ? `${Math.round(player.position.x)}, ${Math.round(player.position.z)}`
      : `${Math.round(controls.target.x)}, ${Math.round(controls.target.z)}`
  }
  renderer.render(scene, camera)
}

async function main () {
  manifest = await fetch('world/manifest.json').then(response => {
    if (!response.ok) throw new Error(`无法读取世界清单 (${response.status})`)
    return response.json()
  })
  createRenderer()
  const [atlas] = await Promise.all([loadAtlas(), loadCollision()])
  const paletteTexture = createPaletteTexture()
  const rectData = createRectTexture()
  material = new THREE.MeshBasicMaterial({
    map: atlas,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    fog: true
  })
  material.onBeforeCompile = shader => {
    shader.uniforms.palette = { value: paletteTexture }
    shader.uniforms.rectMap = { value: rectData.texture }
    shader.uniforms.rectCount = { value: rectData.count }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float colorIndex;\nattribute float textureId;\nuniform sampler2D palette;\nvarying vec3 vPaletteColor;\nvarying float vTextureId;'
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvUv = uv / 16.0;\n\tvTextureId = textureId;\n\tvPaletteColor = texture2D(palette, vec2((colorIndex + 0.5) / 256.0, 0.5)).rgb;'
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D rectMap;\nuniform float rectCount;\nvarying vec3 vPaletteColor;\nvarying float vTextureId;'
      )
      .replace(
        '#include <map_fragment>',
        '#ifdef USE_MAP\n\tvec4 rect = texture2D( rectMap, vec2( ( vTextureId + 0.5 ) / rectCount, 0.5 ) );\n\tvec4 texelColor = texture2D( map, rect.xy + fract( vUv ) * rect.zw );\n\ttexelColor = mapTexelToLinear( texelColor );\n\tdiffuseColor *= texelColor;\n#endif\n\tdiffuseColor.rgb *= vPaletteColor;'
      )
  }
  material.customProgramCacheKey = () => 'palette-index-v3'
  bindUi()
  loadAllTiles()
  animate.last = performance.now()
  animate()
}

main().catch(showError)
