let graphData = null;
let lastResult = null;
let activeBlockedRoads = [];

const startSelect = document.getElementById("startNode");
const destinationSelect = document.getElementById("destinationNode");
const emergencySelect = document.getElementById("emergencyLevel");
const trafficSelect = document.getElementById("trafficLevel");
const blockToggle = document.getElementById("blockToggle");
const blockedRoadSelect = document.getElementById("blockedRoad");
const blockedRoadWrap = document.getElementById("blockedRoadWrap");
const roadSvg = document.getElementById("roadSvg");
const canvas = document.getElementById("graphCanvas");
const ambulanceDijkstra = document.getElementById("ambulanceDijkstra");
const ambulanceGreedy = document.getElementById("ambulanceGreedy");

document.getElementById("findRouteBtn").addEventListener("click", findRoute);
document.getElementById("trafficBtn").addEventListener("click", updateLiveTraffic);
document.getElementById("replayBtn").addEventListener("click", replayAnimation);
document.getElementById("exportBtn").addEventListener("click", exportReport);
blockToggle.addEventListener("change", () => {
    blockedRoadWrap.classList.toggle("hidden", !blockToggle.checked);
    drawGraph();
});
blockedRoadSelect.addEventListener("change", drawGraph);

loadGraph();

async function loadGraph() {
    const response = await fetch("/graph");
    graphData = await response.json();

    fillNodeDropdowns();
    fillBlockedRoadDropdown();
    drawGraph();
}

function fillNodeDropdowns() {
    Object.entries(graphData.nodes).forEach(([id, node]) => {
        if (node.type === "hospital") {
            startSelect.appendChild(new Option(`${id} - ${node.name}`, id));
        }
        if (node.type === "emergency") {
            destinationSelect.appendChild(new Option(`${id} - ${node.name}`, id));
        }
    });
}

function fillBlockedRoadDropdown() {
    graphData.roads.forEach((road) => {
        const key = roadKey(road.from, road.to);
        blockedRoadSelect.appendChild(new Option(`${road.from} ↔ ${road.to}`, key));
    });
}

function roadKey(a, b) {
    return [a, b].sort().join("--");
}

function selectedBlockedRoads() {
    return blockToggle.checked ? [blockedRoadSelect.value] : [];
}

function drawGraph(dijkstraPath = [], greedyPath = []) {
    if (!graphData) return;

    activeBlockedRoads = selectedBlockedRoads();
    roadSvg.innerHTML = "";
    canvas.querySelectorAll(".node").forEach((node) => node.remove());

    graphData.roads.forEach((road) => {
        const from = graphData.nodes[road.from];
        const to = graphData.nodes[road.to];
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        const key = roadKey(road.from, road.to);

        line.setAttribute("x1", from.x);
        line.setAttribute("y1", from.y);
        line.setAttribute("x2", to.x);
        line.setAttribute("y2", to.y);
        line.dataset.key = key;
        line.classList.add("road-line");

        if (activeBlockedRoads.includes(key)) line.classList.add("blocked");
        if (pathHasRoad(dijkstraPath, road.from, road.to)) line.classList.add("dijkstra-route");
        if (pathHasRoad(greedyPath, road.from, road.to)) line.classList.add("greedy-route");

        roadSvg.appendChild(line);
    });

    Object.entries(graphData.nodes).forEach(([id, node]) => {
        const marker = document.createElement("div");
        marker.className = `node ${node.type}`;
        marker.id = `node-${id}`;
        marker.textContent = id;
        marker.title = node.name;
        marker.style.left = `${node.x}%`;
        marker.style.top = `${node.y}%`;
        canvas.appendChild(marker);
    });

    placeAmbulance(ambulanceDijkstra, startSelect.value);
    placeAmbulance(ambulanceGreedy, startSelect.value);
}

function pathHasRoad(path, a, b) {
    for (let index = 0; index < path.length - 1; index++) {
        if (roadKey(path[index], path[index + 1]) === roadKey(a, b)) {
            return true;
        }
    }
    return false;
}

async function findRoute() {
    const payload = {
        start: startSelect.value,
        destination: destinationSelect.value,
        emergencyLevel: emergencySelect.value,
        traffic: trafficSelect.value,
        blockedRoads: selectedBlockedRoads(),
    };

    document.getElementById("routeStatus").textContent = "Dispatch center is calculating safest route...";

    const response = await fetch("/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    lastResult = await response.json();
    drawGraph(lastResult.dijkstra.path, lastResult.greedy.path);
    updateDashboard(lastResult);
    renderSteps(lastResult.dijkstra.steps);
    await animateAlgorithmSteps(lastResult.dijkstra.steps, lastResult.dijkstra.path);
    animateRoute(ambulanceDijkstra, lastResult.dijkstra.path, 0);
    animateRoute(ambulanceGreedy, lastResult.greedy.path, 280);
}

function updateDashboard(result) {
    const dijkstra = result.dijkstra;
    const greedy = result.greedy;

    document.getElementById("dijkstraPath").textContent = dijkstra.path.length ? dijkstra.path.join(" → ") : "No route";
    document.getElementById("greedyPath").textContent = greedy.path.length ? greedy.path.join(" → ") : "No route";
    document.getElementById("dijkstraTime").textContent = `Time: ${formatTime(dijkstra.estimatedTime)} | Cost: ${formatCost(dijkstra.totalCost)}`;
    document.getElementById("greedyTime").textContent = `Time: ${formatTime(greedy.estimatedTime)} | Cost: ${formatCost(greedy.totalCost)}`;
    document.getElementById("costCompare").textContent = `${formatCost(dijkstra.totalCost)} vs ${formatCost(greedy.totalCost)}`;
    document.getElementById("efficiency").textContent = `${result.efficiencyImprovement}%`;
    document.getElementById("exploredNodes").textContent = dijkstra.exploredNodes.join(" → ");
    document.getElementById("routeStatus").textContent = "Routes calculated. Cyan is Dijkstra, yellow dashed is greedy.";

    if (emergencySelect.value === "Critical") {
        document.body.classList.add("critical-mode");
    } else {
        document.body.classList.remove("critical-mode");
    }
}

function renderSteps(steps) {
    const body = document.getElementById("stepsBody");
    body.innerHTML = "";

    steps.forEach((step) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${step.current}</td>
            <td>${step.neighbor}</td>
            <td>${step.distance ?? "-"}</td>
            <td>${step.weight}</td>
            <td>${step.oldDistance}</td>
            <td>${step.newDistance}</td>
            <td>${step.action}</td>
        `;
        body.appendChild(row);
    });
}

async function animateAlgorithmSteps(steps, finalPath) {
    clearNodeHighlights();

    // Show the professor-friendly Dijkstra process before ambulance movement.
    for (const step of steps.slice(0, 18)) {
        clearNodeHighlights();
        markNode(step.current, "current");
        markNode(step.neighbor, "checked");
        await wait(180);
    }

    finalPath.forEach((node) => markNode(node, "final"));
}

function clearNodeHighlights() {
    document.querySelectorAll(".node").forEach((node) => {
        node.classList.remove("current", "checked", "final");
    });
}

function markNode(nodeId, className) {
    const node = document.getElementById(`node-${nodeId}`);
    if (node) node.classList.add(className);
}

function placeAmbulance(element, nodeId) {
    const node = graphData.nodes[nodeId];
    if (!node) return;
    element.style.left = `${node.x}%`;
    element.style.top = `${node.y}%`;
}

function animateRoute(element, path, delay) {
    if (!path || path.length === 0) return;

    setTimeout(() => {
        path.forEach((nodeId, index) => {
            setTimeout(() => placeAmbulance(element, nodeId), index * 850);
        });
    }, delay);
}

function replayAnimation() {
    if (!lastResult) {
        findRoute();
        return;
    }
    placeAmbulance(ambulanceDijkstra, lastResult.dijkstra.path[0]);
    placeAmbulance(ambulanceGreedy, lastResult.greedy.path[0]);
    animateRoute(ambulanceDijkstra, lastResult.dijkstra.path, 0);
    animateRoute(ambulanceGreedy, lastResult.greedy.path, 280);
}

function updateLiveTraffic() {
    const levels = ["Low", "Medium", "High"];
    const randomLevel = levels[Math.floor(Math.random() * levels.length)];
    trafficSelect.value = randomLevel;
    document.getElementById("routeStatus").textContent = `Live traffic updated to ${randomLevel}. Recalculating route...`;
    findRoute();
}

function exportReport() {
    if (!lastResult) {
        alert("Calculate a route first.");
        return;
    }

    const report = [
        "Emergency Ambulance Routing Optimization Report",
        "------------------------------------------------",
        `Start: ${startSelect.value}`,
        `Destination: ${destinationSelect.value}`,
        `Emergency Level: ${emergencySelect.value}`,
        `Traffic Density: ${trafficSelect.value}`,
        `Blocked Roads: ${selectedBlockedRoads().join(", ") || "None"}`,
        "",
        `Dijkstra Route: ${lastResult.dijkstra.path.join(" -> ")}`,
        `Dijkstra Cost: ${formatCost(lastResult.dijkstra.totalCost)}`,
        `Dijkstra Time: ${formatTime(lastResult.dijkstra.estimatedTime)}`,
        "",
        `Greedy Route: ${lastResult.greedy.path.join(" -> ")}`,
        `Greedy Cost: ${formatCost(lastResult.greedy.totalCost)}`,
        `Greedy Time: ${formatTime(lastResult.greedy.estimatedTime)}`,
        "",
        `Efficiency Improvement: ${lastResult.efficiencyImprovement}%`,
        "",
        "Conclusion: Dijkstra is more reliable because it compares accumulated route cost, while greedy only checks the next best-looking node.",
    ].join("\n");

    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ambulance-route-report.txt";
    link.click();
    URL.revokeObjectURL(url);
}

function formatTime(value) {
    return value === null || value === undefined ? "-" : `${value} min`;
}

function formatCost(value) {
    return value === null || value === undefined ? "-" : value;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
