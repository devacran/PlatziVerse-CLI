#!/usr/bin/env node

"use strict";

/* eslint new-cap: "off" */

const blessed = require("blessed");
const contrib = require("blessed-contrib");
const moment = require("moment");
const PlatziVerseAgent = require("platziverseagent");

const agent = new PlatziVerseAgent();
const screen = blessed.screen();

//referencia interna de los agentes y las metricas
const agents = new Map();
const agentMetrics = new Map();
let extended = []; //Para que permanezca extendido cuando se le de click
let selected = {
  uuid: null,
  type: null
};

const grid = new contrib.grid({
  rows: 1,
  cols: 4,
  screen
});
//fila 0, columna 0, todo el espacio de la col, todo el espacio de la fila.
const tree = grid.set(0, 0, 1, 1, contrib.tree, {
  label: "Connected Agents"
});
//fila 0, columna 1, todo el espacio de la col, 3 espacios usara
const line = grid.set(0, 1, 1, 3, contrib.line, {
  label: "Metric",
  showLegend: true,
  minY: 0,
  xPadding: 5
});

agent.on("agent/connected", payload => {
  const { uuid } = payload.agent;
  //Si el agente no esta en la lista
  if (!agents.has(uuid)) {
    agents.set(uuid, payload.agent);
    agentMetrics.set(uuid, {}); //Estas metricas van a llegar en el evento agent/message
  }

  renderData(); //Pinta la info en el arbol
});

agent.on("agent/disconnected", payload => {
  const { uuid } = payload.agent;

  if (agents.has(uuid)) {
    agents.delete(uuid);
    agentMetrics.delete(uuid);
  }

  renderData();
});

agent.on("agent/message", payload => {
  const { uuid } = payload.agent;
  const { timestamp } = payload;
  //Si se conecta un agente nuevo lo agrega a la lista
  if (!agents.has(uuid)) {
    agents.set(uuid, payload.agent);
    agentMetrics.set(uuid, {});
  }

  const metrics = agentMetrics.get(uuid);

  payload.metrics.forEach(m => {
    const { type, value } = m; //obtenemos el tipo y valor de cada metrica

    if (!Array.isArray(metrics[type])) {
      metrics[type] = [];
    }

    const length = metrics[type].length;
    if (length >= 20) {
      metrics[type].shift(); //Elimina la primer posicion del arreglo
    }
    //Le agrega
    metrics[type].push({
      value,
      timestamp: moment(timestamp).format("HH:mm:ss")
    });
  });

  renderData();
});

//Para que permanezca extendido cuando se le de click
tree.on("select", node => {
  //Se ejecuta cuando se selecciona un elemento
  const { uuid } = node;

  if (node.agent) {
    //Si selecciono un agente
    node.extended
      ? extended.push(uuid)
      : (extended = extended.filter(e => e !== uuid));
    selected.uuid = null;
    selected.type = null;
    return;
  }
  //Si selecciono una metrica
  selected.uuid = uuid;
  selected.type = node.type;

  renderMetric();
});

function renderData() {
  const treeData = {};
  let idx = 0; //para iterar y generar el id unico
  for (let [uuid, val] of agents) {
    const title = ` ${val.name} - (${val.pid})`;
    treeData[title] = {
      uuid,
      agent: true,
      extended: extended.includes(uuid), //para que pemanezca extendido
      children: {}
    };
    //cada metrica la agrega al arbol como hijo
    const metrics = agentMetrics.get(uuid);
    Object.keys(metrics).forEach(type => {
      const metric = {
        uuid,
        type,
        metric: true
      };

      const metricName = ` ${type} ${" ".repeat(1000)} ${idx++}`; //Para ponerle nombre unico y que no se repita
      treeData[title].children[metricName] = metric;
    });
  }

  tree.setData({
    //Agrega la info al arbol
    extended: true, //Para que lo muestre abierto
    children: treeData
  });
  renderMetric(); //renderiza la metrica
}

function renderMetric() {
  //Si no tengo nada seleccionado grafica una grafica vacia
  if (!selected.uuid && !selected.type) {
    line.setData([{ x: [], y: [], title: "" }]);
    screen.render();
    return;
  }
  //Esto es para renderizar la grafica,
  const metrics = agentMetrics.get(selected.uuid);
  const values = metrics[selected.type];
  const series = [
    {
      title: selected.type,
      x: values.map(v => v.timestamp).slice(-10), //Obtenemos los ultimos 10 datos
      y: values.map(v => v.value).slice(-10)
    }
  ];

  line.setData(series);
  screen.render();
}

//para decirle que hacer cuando se oprima cualquiera de esas teclas
screen.key(["escape", "q", "C-c"], (ch, key) => {
  process.exit(0);
});

agent.connect();
tree.focus(); //Para que permita usar el focus del teclado
screen.render();
