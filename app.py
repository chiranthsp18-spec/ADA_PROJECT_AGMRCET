import os
from flask import Flask, jsonify, render_template, request
import heapq
import math

app = Flask(__name__)


# Fixed city graph used by the demo.
# Each node has x/y positions so the frontend can draw the same graph visually.
NODES = {
    "H1": {"name": "City Hospital", "type": "hospital", "x": 9, "y": 22},
    "H2": {"name": "Metro Care", "type": "hospital", "x": 12, "y": 76},
    "A": {"name": "Aster Junction", "type": "junction", "x": 29, "y": 18},
    "B": {"name": "Blue Square", "type": "junction", "x": 47, "y": 30},
    "C": {"name": "Central Market", "type": "junction", "x": 68, "y": 17},
    "D": {"name": "Delta Bridge", "type": "junction", "x": 32, "y": 58},
    "E": {"name": "East Colony", "type": "junction", "x": 60, "y": 58},
    "F": {"name": "Fire Station Road", "type": "junction", "x": 82, "y": 48},
    "G": {"name": "Green Park", "type": "junction", "x": 77, "y": 82},
    "P1": {"name": "Accident Site", "type": "emergency", "x": 92, "y": 20},
    "P2": {"name": "Mall Emergency", "type": "emergency", "x": 91, "y": 73},
}


# Undirected roads. distance is in kilometers.
ROADS = [
    {"from": "H1", "to": "A", "distance": 3.2},
    {"from": "H1", "to": "D", "distance": 5.0},
    {"from": "H2", "to": "D", "distance": 2.6},
    {"from": "H2", "to": "G", "distance": 8.0},
    {"from": "A", "to": "B", "distance": 2.4},
    {"from": "A", "to": "D", "distance": 4.1},
    {"from": "B", "to": "C", "distance": 3.0},
    {"from": "B", "to": "D", "distance": 3.7},
    {"from": "B", "to": "E", "distance": 3.2},
    {"from": "C", "to": "P1", "distance": 2.8},
    {"from": "C", "to": "F", "distance": 3.9},
    {"from": "D", "to": "E", "distance": 3.4},
    {"from": "D", "to": "G", "distance": 5.5},
    {"from": "E", "to": "F", "distance": 2.5},
    {"from": "E", "to": "G", "distance": 3.3},
    {"from": "F", "to": "P1", "distance": 3.1},
    {"from": "F", "to": "P2", "distance": 3.6},
    {"from": "G", "to": "P2", "distance": 2.7},
]


EMERGENCY_PRIORITY = {
    "Low": 0.0,
    "Medium": 0.5,
    "High": 1.0,
    "Critical": 1.8,
}

TRAFFIC_PENALTY = {
    "Low": 0.4,
    "Medium": 1.2,
    "High": 2.6,
}


def build_adjacency():
    """Create an adjacency list so algorithms can quickly find neighbors."""
    graph = {node: [] for node in NODES}
    for road in ROADS:
        graph[road["from"]].append({"node": road["to"], "distance": road["distance"]})
        graph[road["to"]].append({"node": road["from"], "distance": road["distance"]})
    return graph


def road_key(node_a, node_b):
    """Store road blockages with the same key no matter the direction."""
    return "--".join(sorted([node_a, node_b]))


def dynamic_weight(distance, traffic_level, emergency_level):
    """
    Main project formula:
    weight = distance + traffic_penalty - emergency_priority_adjustment

    max(0.5, ...) keeps every road cost positive for Dijkstra's Algorithm.
    """
    penalty = TRAFFIC_PENALTY.get(traffic_level, 1.2)
    priority = EMERGENCY_PRIORITY.get(emergency_level, 0.5)
    return round(max(0.5, distance + penalty - priority), 2)


def estimate_response_time(total_cost, emergency_level):
    """Convert cost into minutes. Critical cases get faster dispatch handling."""
    speed_bonus = {"Low": 1.0, "Medium": 0.95, "High": 0.88, "Critical": 0.78}
    return round(total_cost * 2.4 * speed_bonus.get(emergency_level, 1.0), 1)


def euclidean_distance(node_a, node_b):
    """Straight-line distance used by greedy routing to choose the next node."""
    a = NODES[node_a]
    b = NODES[node_b]
    return math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2)


def reconstruct_path(previous, start, destination):
    path = []
    current = destination
    while current is not None:
        path.append(current)
        current = previous.get(current)
    path.reverse()
    return path if path and path[0] == start else []


def path_cost(path, traffic_level, emergency_level, blocked_roads):
    if len(path) < 2:
        return 0

    graph = build_adjacency()
    total = 0
    for index in range(len(path) - 1):
        current = path[index]
        next_node = path[index + 1]
        if road_key(current, next_node) in blocked_roads:
            return float("inf")
        edge = next(edge for edge in graph[current] if edge["node"] == next_node)
        total += dynamic_weight(edge["distance"], traffic_level, emergency_level)
    return round(total, 2)


def dijkstra(start, destination, traffic_level, emergency_level, blocked_roads):
    graph = build_adjacency()
    distances = {node: float("inf") for node in graph}
    previous = {node: None for node in graph}
    visited = set()
    queue = [(0, start)]
    distances[start] = 0
    explored_nodes = []
    steps = []

    while queue:
        current_distance, current = heapq.heappop(queue)
        if current in visited:
            continue

        visited.add(current)
        explored_nodes.append(current)

        if current == destination:
            break

        for edge in graph[current]:
            neighbor = edge["node"]
            is_blocked = road_key(current, neighbor) in blocked_roads

            if is_blocked:
                steps.append({
                    "current": current,
                    "neighbor": neighbor,
                    "distance": edge["distance"],
                    "weight": "Blocked",
                    "oldDistance": format_distance(distances[neighbor]),
                    "newDistance": "Blocked",
                    "action": "Skipped blocked road",
                })
                continue

            weight = dynamic_weight(edge["distance"], traffic_level, emergency_level)
            new_distance = round(current_distance + weight, 2)
            old_distance = distances[neighbor]
            action = "No update"

            if new_distance < distances[neighbor]:
                distances[neighbor] = new_distance
                previous[neighbor] = current
                heapq.heappush(queue, (new_distance, neighbor))
                action = f"Updated {neighbor} via {current}"

            steps.append({
                "current": current,
                "neighbor": neighbor,
                "distance": edge["distance"],
                "weight": weight,
                "oldDistance": format_distance(old_distance),
                "newDistance": format_distance(distances[neighbor]),
                "action": action,
            })

    path = reconstruct_path(previous, start, destination)
    total_cost = distances[destination]
    if not path:
        total_cost = float("inf")

    return {
        "path": path,
        "totalCost": round(total_cost, 2) if total_cost != float("inf") else None,
        "estimatedTime": estimate_response_time(total_cost, emergency_level) if total_cost != float("inf") else None,
        "exploredNodes": explored_nodes,
        "steps": steps,
    }


def greedy_route(start, destination, traffic_level, emergency_level, blocked_roads):
    """
    Greedy routing chooses the neighbor that looks closest to the destination.
    This is fast, but it can miss a better overall route.
    """
    graph = build_adjacency()
    current = start
    visited = {start}
    path = [start]
    explored_nodes = [start]
    steps = []

    while current != destination:
        candidates = []
        for edge in graph[current]:
            neighbor = edge["node"]
            blocked = road_key(current, neighbor) in blocked_roads
            if neighbor in visited or blocked:
                steps.append({
                    "current": current,
                    "neighbor": neighbor,
                    "heuristic": "Skipped",
                    "action": "Visited already" if neighbor in visited else "Blocked road",
                })
                continue

            heuristic = round(euclidean_distance(neighbor, destination), 2)
            candidates.append((heuristic, neighbor))
            steps.append({
                "current": current,
                "neighbor": neighbor,
                "heuristic": heuristic,
                "action": "Candidate checked",
            })

        if not candidates:
            return {
                "path": path,
                "totalCost": None,
                "estimatedTime": None,
                "exploredNodes": explored_nodes,
                "steps": steps,
                "stuck": True,
            }

        candidates.sort()
        current = candidates[0][1]
        visited.add(current)
        explored_nodes.append(current)
        path.append(current)

    total_cost = path_cost(path, traffic_level, emergency_level, blocked_roads)
    return {
        "path": path,
        "totalCost": total_cost if total_cost != float("inf") else None,
        "estimatedTime": estimate_response_time(total_cost, emergency_level) if total_cost != float("inf") else None,
        "exploredNodes": explored_nodes,
        "steps": steps,
        "stuck": False,
    }


def format_distance(value):
    if value == float("inf"):
        return "Infinity"
    return round(value, 2)


def parse_blocked_roads(payload):
    return set(payload.get("blockedRoads", []))


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/graph")
def graph_data():
    return jsonify({"nodes": NODES, "roads": ROADS})


@app.route("/route", methods=["POST"])
def route():
    payload = request.get_json()
    start = payload.get("start")
    destination = payload.get("destination")
    traffic_level = payload.get("traffic", "Medium")
    emergency_level = payload.get("emergencyLevel", "Medium")
    blocked_roads = parse_blocked_roads(payload)

    if start not in NODES or destination not in NODES:
        return jsonify({"error": "Invalid start or destination node."}), 400

    dijkstra_result = dijkstra(start, destination, traffic_level, emergency_level, blocked_roads)
    greedy_result = greedy_route(start, destination, traffic_level, emergency_level, blocked_roads)

    if dijkstra_result["totalCost"] and greedy_result["totalCost"]:
        improvement = ((greedy_result["totalCost"] - dijkstra_result["totalCost"]) / greedy_result["totalCost"]) * 100
        improvement = round(max(0, improvement), 1)
    else:
        improvement = 0

    return jsonify({
        "dijkstra": dijkstra_result,
        "greedy": greedy_result,
        "efficiencyImprovement": improvement,
        "blockedRoads": list(blocked_roads),
        "formula": "weight = distance + traffic_penalty - emergency_priority_adjustment",
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
