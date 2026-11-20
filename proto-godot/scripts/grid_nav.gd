extends RefCounted
## Grid helpers: reverse multi-source BFS distance field and neighbour selection.
## Four-way movement. Index is y * width + x. Blocked/unreachable cells hold INF_DIST.

const INF_DIST: int = 1 << 20
const DIRS: Array[Vector2i] = [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1)]


static func idx(w: int, c: Vector2i) -> int:
	return c.y * w + c.x


static func in_bounds(w: int, h: int, c: Vector2i) -> bool:
	return c.x >= 0 and c.y >= 0 and c.x < w and c.y < h


## Distance (in steps) from every cell to the nearest exit, flowing around `blocked`.
@warning_ignore("integer_division")
static func compute_field(w: int, h: int, blocked: PackedByteArray, exits: Array[Vector2i]) -> PackedInt32Array:
	var dist := PackedInt32Array()
	dist.resize(w * h)
	dist.fill(INF_DIST)
	var queue := PackedInt32Array()
	queue.resize(w * h)
	var head: int = 0
	var tail: int = 0
	for e: Vector2i in exits:
		if not in_bounds(w, h, e):
			continue
		var ei: int = e.y * w + e.x
		if blocked[ei] != 0 or dist[ei] == 0:
			continue
		dist[ei] = 0
		queue[tail] = ei
		tail += 1
	while head < tail:
		var cur: int = queue[head]
		head += 1
		var cx: int = cur % w
		var cy: int = cur / w
		var nd: int = dist[cur] + 1
		for d: Vector2i in DIRS:
			var nx: int = cx + d.x
			var ny: int = cy + d.y
			if nx < 0 or ny < 0 or nx >= w or ny >= h:
				continue
			var ni: int = ny * w + nx
			if blocked[ni] != 0 or dist[ni] <= nd:
				continue
			dist[ni] = nd
			queue[tail] = ni
			tail += 1
	return dist


static func reachable(dist: PackedInt32Array, w: int, c: Vector2i) -> bool:
	return dist[c.y * w + c.x] < INF_DIST


## Neighbour with strictly smaller distance, or `c` itself when none exists.
static func best_neighbor(w: int, h: int, dist: PackedInt32Array, c: Vector2i) -> Vector2i:
	var best: Vector2i = c
	var best_d: int = dist[c.y * w + c.x]
	for d: Vector2i in DIRS:
		var n: Vector2i = c + d
		if not in_bounds(w, h, n):
			continue
		var nd: int = dist[n.y * w + n.x]
		if nd < best_d:
			best_d = nd
			best = n
	return best
