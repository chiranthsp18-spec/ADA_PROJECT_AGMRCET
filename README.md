# Emergency Ambulance Routing Optimization System

A beginner-friendly Flask project that compares Dijkstra's Algorithm and Greedy Routing for emergency ambulance dispatch.

## Tech Stack

- Backend: Python Flask
- Frontend: HTML, CSS, JavaScript
- Algorithms: Dijkstra's Algorithm and Greedy Routing

## Features

- Select start hospital and emergency destination.
- Choose emergency level: Low, Medium, High, Critical.
- Choose traffic density: Low, Medium, High.
- Turn road blockage on or off.
- Dynamic road weight calculation:

```text
weight = distance + traffic_penalty - emergency_priority_adjustment
```

- Visual city graph with nodes and roads.
- Ambulance animation for Dijkstra and Greedy routes.
- Step-by-step Dijkstra table.
- Live traffic update button.
- Replay animation.
- Export route report.
- Explanation panel showing why Dijkstra is better than greedy for weighted routing.

## Project Structure

```text
project/
|-- app.py
|-- requirements.txt
|-- templates/
|   `-- index.html
|-- static/
|   |-- style.css
|   `-- script.js
`-- README.md
```

## How to Run

1. Install dependencies:

```bash
pip install -r requirements.txt
```

2. Start the Flask server:

```bash
python app.py
```

3. Open in browser:

```text
http://127.0.0.1:5000
```

## How It Works

The backend stores a fixed city road graph. Every road has a distance. When the user selects traffic and emergency level, the backend calculates a dynamic road weight.

Dijkstra's Algorithm checks routes using total accumulated cost. It keeps updating the shortest known distance to every node until it reaches the emergency destination.

Greedy Routing chooses the next node that appears closest to the destination. This can be faster to understand, but it may choose a poor route because it does not compare the complete path cost.

## Good Demo Settings

Try these settings during presentation:

- Start: H1 - City Hospital
- Destination: P2 - Mall Emergency
- Emergency Level: Critical
- Traffic Density: High
- Road Blockage: On

Then click **Live Traffic Update** and **Replay Animation** to show dynamic behavior.
