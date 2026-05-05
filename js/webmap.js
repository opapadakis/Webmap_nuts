let nutsData = null;

const CONFIG = {
    mode: "local", // "local" OR "github"

    local: {
        base: "/data/"
    },

    github: {
        base: "https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/data/"
    }
};

const map = new maplibregl.Map({
    container: "map",
    style: `https://api.maptiler.com/maps/outdoor/style.json?key=${MAPTILER_KEY}`,
    center: [-3.7, 40.4], // Spain
    zoom: 5
});

map.on("load", async () => {

    await loadNuts();

    map.addSource("nuts", {
        type: "geojson",
        data: nutsData
    });

    map.addLayer({
        id: "regions",
        type: "fill",
        source: "nuts",
        paint: {
            "fill-color": "#ccc",
            "fill-opacity": 0.5
        }
    });

    loadCatalog();
});

function getDataPath(path) {
    return `${CONFIG[CONFIG.mode].base}/${path}`;
}

async function loadNuts() {
    try {
        const res = await fetch("data/nutsrg_2.json"));
        console.log("NUTS response:", res);
        nutsData = await res.json();
        console.log("Loaded NUTS data:", nutsData);
    } catch (e) {
        console.error("Failed to load from webmap, trying fallback...");
        // Fallback to the original URL if the local file fails
        //geojson: 
        url="https://raw.githubusercontent.com/eurostat/Nuts2json/master/pub/v2/2021/4326/20M/nutsrg_2.json"
        const res = await fetch(url);
        nutsData = await res.json();
        console.log("Loaded from fallback URL:", url);
    }
}

async function loadCatalog() {
    const res = await fetch("data/layers_catalog.csv");
    const text = await res.text();

    const rows = text.split("\n").slice(1);

    const menu = document.getElementById("menu");
    menu.innerHTML = "";

    const categories = {};

    rows.forEach(r => {
        if (!r.trim()) return;

        const cols = r.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
        
        const category = cols[0];
        const layer = cols[1];
        const definition = cols[2];
        const api = cols[5];
        const style = cols[11].trim()
                .replace(/^"/, '')     // remove first quote
                .replace(/"$/, '')     // remove last quote
                .replace(/""/g, '"');  // fix double quotes
        console.log("Parsed row:", { category, layer, definition, style });
        // group by category
        if (!categories[category]) {
            categories[category] = [];
        }

        categories[category].push({
            layer,
            definition,
            api,
            style
        });
    });

    // build menu
    Object.keys(categories).forEach(cat => {

        // category title
        const title = document.createElement("div");
        title.textContent = "+ " + capitalizeFirstLetter(cat);
        title.classList.add("category-title");

        const container = document.createElement("div");
        container.style.display = "none";

        title.onclick = () => {
            const isHidden = container.style.display === "none";
            container.style.display = isHidden ? "block" : "none";
            title.textContent = (isHidden ? "− " : "+ ") + cat;
        };

        menu.appendChild(title);
        menu.appendChild(container);
        console.log("Category:", cat);
        // layers
        categories[cat].forEach(item => {
            console.log("Layer item:", item);
            const btn = document.createElement("button");

            // use definition instead of layer
            btn.textContent = capitalizeFirstLetter(item.definition);
            
            const legend = document.createElement("div");
            legend.style.display = "none";
            const styleArray = typeof item.style === "string"
                ? JSON.parse(
                    item.style
                        .trim()
                        .replace(/^"/, '')
                        .replace(/"$/, '')
                        .replace(/""/g, '"')
                )
                : item.style;
            console.log("Parsed style array:", styleArray);
            styleArray.forEach(s => {
                const key = Object.keys(s)[0];
                const value = s[key];

                const row = document.createElement("div");

                const colorBox = document.createElement("span");
                colorBox.style.background = value;
                colorBox.classList.add("legend-color");

                const text = document.createElement("span");
                text.textContent = key;

                row.appendChild(colorBox);
                row.appendChild(text);

                legend.appendChild(row);
            });
            btn.onclick = () => {
                loadEurostatLayer(item.layer, item.api, item.style);

                btn.style.display = "none";     // 👈 hide button
                legend.style.display = "block"; // 👈 show legend
            };
            //btn.insertAdjacentHTML("afterend", "<br>");
            container.appendChild(btn);
            container.appendChild(legend);
            

        });
    });
}


function capitalizeFirstLetter(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function loadEurostatLayer(layerName, apiUrl, style) {

    console.log("Fetching:", layerName);
    console.log("API URL:", apiUrl);

    const res = await fetch(apiUrl);
    const data = await res.json();

    const values = extractEurostatValues(data);

    applyDataToMap(layerName, values, style);
}

function extractEurostatValues(data) {

    const result = {};
    console.log("Extracting values from data:", data);
    const geoIndex = data.dimension.geo.category.index;
    const values = data.value;

    Object.keys(geoIndex).forEach(region => {

        const index = geoIndex[region];
        const value = values[index];

        if (value !== undefined) {
            result[region] = value;
        }
    });

    return result;
}

function applyDataToMap(layerName, values, style) {

    const features = nutsData.features;
    console.log("features:", features);
    console.log("values:", values);
    console.log("style:", style);
    features.forEach(f => {

        const code = f.properties.id;

        f.properties.value = values[code] || null;
    });

    if (map.getSource("nuts")) {
        map.getSource("nuts").setData(nutsData);
    }

    applyStyle(style);
}

function applyStyle(styleStr) {
    console.log("Applying style:", styleStr);
    const style = JSON.parse(styleStr);

    const stops = [];

    style.forEach(s => {
        const key = Object.keys(s)[0];
        const color = s[key];

        const range = key.split("-");
        const min = parseFloat(range[0]);

        stops.push([min, color]);
    });

    map.setPaintProperty("regions", "fill-color", [
        "interpolate",
        ["linear"],
        ["get", "value"],
        ...stops.flat()
    ]);
}

