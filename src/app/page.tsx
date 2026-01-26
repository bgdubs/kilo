"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Container {
  id: number;
  name: string;
  imageData: string;
  createdAt: Date;
}

interface Item {
  id: number;
  containerId: number;
  name: string;
  imageData: string;
  createdAt: Date;
}

export default function Home() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [newContainerName, setNewContainerName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const containerInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);

  const fetchContainers = useCallback(async () => {
    const res = await fetch("/api/containers");
    const data = await res.json();
    setContainers(data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContainers();
  }, [fetchContainers]);

  const fetchItems = async (containerId: number) => {
    const res = await fetch(`/api/items?containerId=${containerId}`);
    const data = await res.json();
    setItems(data);
  };

  const handleContainerImageCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const createContainer = async () => {
    if (!capturedImage || !newContainerName) return;
    await fetch("/api/containers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newContainerName, imageData: capturedImage }),
    });
    setCapturedImage(null);
    setNewContainerName("");
    fetchContainers();
  };

  const handleItemImageCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const createItem = async () => {
    if (!capturedImage || !newItemName || !selectedContainer) return;
    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ containerId: selectedContainer.id, name: newItemName, imageData: capturedImage }),
    });
    setCapturedImage(null);
    setNewItemName("");
    fetchItems(selectedContainer.id);
  };

  const exportToCSV = () => {
    const csv = [
      ["Container", "Item", "Created At"],
      ...containers.flatMap(container =>
        items.filter(item => item.containerId === container.id).map(item => [
          container.name,
          item.name,
          new Date(item.createdAt).toLocaleString(),
        ])
      ),
    ]
      .map(row => row.map(cell => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inventory.csv";
    a.click();
  };

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-8">Inventory App</h1>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Containers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {containers.map(container => (
            <div
              key={container.id}
              className="border rounded p-4 cursor-pointer"
              onClick={() => {
                setSelectedContainer(container);
                fetchItems(container.id);
              }}
            >
              <img src={container.imageData} alt={container.name} className="w-full h-32 object-cover mb-2" />
              <h3 className="font-semibold">{container.name}</h3>
            </div>
          ))}
        </div>
        <button
          onClick={() => containerInputRef.current?.click()}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Add Container
        </button>
        <input
          ref={containerInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleContainerImageCapture}
          className="hidden"
        />
      </div>

      {capturedImage && (
        <div className="mb-8">
          <img src={capturedImage} alt="Captured" className="w-32 h-32 object-cover mb-2" />
          <input
            type="text"
            placeholder="Enter name"
            value={selectedContainer ? newItemName : newContainerName}
            onChange={(e) => selectedContainer ? setNewItemName(e.target.value) : setNewContainerName(e.target.value)}
            className="border px-2 py-1 mr-2"
          />
          <button
            onClick={selectedContainer ? createItem : createContainer}
            className="bg-green-500 text-white px-4 py-2 rounded"
          >
            Save
          </button>
        </div>
      )}

      {selectedContainer && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4">Items in {selectedContainer.name}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {items.map(item => (
              <div key={item.id} className="border rounded p-4">
                <img src={item.imageData} alt={item.name} className="w-full h-32 object-cover mb-2" />
                <h3 className="font-semibold">{item.name}</h3>
              </div>
            ))}
          </div>
          <button
            onClick={() => itemInputRef.current?.click()}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Add Item
          </button>
          <input
            ref={itemInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleItemImageCapture}
            className="hidden"
          />
        </div>
      )}

      <button
        onClick={exportToCSV}
        className="bg-purple-500 text-white px-4 py-2 rounded"
      >
        Export to CSV
      </button>
    </main>
  );
}
