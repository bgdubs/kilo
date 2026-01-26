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
  const [searchTerm, setSearchTerm] = useState("");
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

  const handleItemImageCapture = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async () => {
        const imageData = reader.result as string;
        setCapturedImage(imageData);
        
        // Auto-recognize item
        const recognitionResult = await recognizeItem(imageData);
        setNewItemName(recognitionResult.name);
      };
      reader.readAsDataURL(file);
    }
  };

  const recognizeItem = async (imageData: string) => {
    try {
      const res = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageData }),
      });
      return await res.json();
    } catch (error) {
      return { name: "", confidence: 0, category: "Unknown" };
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

  const createMultipleItems = async (quantity: number) => {
    if (!capturedImage || !newItemName || !selectedContainer) return;
    
    for (let i = 0; i < quantity; i++) {
      await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId: selectedContainer.id, name: newItemName, imageData: capturedImage }),
      });
    }
    
    setCapturedImage(null);
    setNewItemName("");
    fetchItems(selectedContainer.id);
  };

  const exportToCSV = () => {
    const csv = [
      ["Container", "Item", "Category", "Quantity", "Created At"],
      ...containers.flatMap(container => {
        const containerItems = items.filter(item => item.containerId === container.id);
        const itemCounts = containerItems.reduce((acc, item) => {
          acc[item.name] = (acc[item.name] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);
        
        return Object.entries(itemCounts).map(([itemName, quantity]) => {
          const item = containerItems.find(i => i.name === itemName);
          return [
            container.name,
            itemName,
            "General", // Category would come from AI recognition
            quantity,
            item ? new Date(item.createdAt).toLocaleString() : "",
          ];
        });
      }),
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
        <input
          type="text"
          placeholder="Search containers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="border px-2 py-1 mb-4 w-full"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          {containers
            .filter(container =>
              container.name.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .map(container => (
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
          {selectedContainer && (
            <div className="flex items-center mt-2">
              <input
                type="number"
                placeholder="Quantity"
                min="1"
                defaultValue="1"
                className="border px-2 py-1 mr-2 w-16"
                ref={(el) => {
                  if (el) {
                    el.value = "1";
                  }
                }}
              />
              <button
                onClick={() => {
                  const quantityInput = document.querySelector("input[type='number']") as HTMLInputElement;
                  const quantity = parseInt(quantityInput.value) || 1;
                  createMultipleItems(quantity);
                }}
                className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
              >
                Add Multiple
              </button>
            </div>
          )}
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
          <input
            type="text"
            placeholder="Search items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border px-2 py-1 mb-4 w-full"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {items
              .filter(item =>
                item.name.toLowerCase().includes(searchTerm.toLowerCase())
              )
              .map(item => (
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
