"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Container {
  id: number;
  name: string;
  description?: string;
  imageData: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  category?: string;
  confidence?: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Item {
  id: number;
  containerId: number;
  name: string;
  description?: string;
  imageData: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  category?: string;
  confidence?: number;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

interface Set {
  id: number;
  name: string;
  description?: string;
  imageData?: string;
  parentId?: number;
  createdAt: Date;
  updatedAt: Date;
}

type View = "browse" | "items" | "edit-container" | "edit-item" | "edit-set";

export default function Home() {
  const [view, setView] = useState<View>("browse");
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "container" | "item" | "set"; id: number } | null>(null);

  // Form states
  const [newContainerName, setNewContainerName] = useState("");
  const [newContainerDescription, setNewContainerDescription] = useState("");
  const [newContainerCategory, setNewContainerCategory] = useState("");
  const [newContainerConfidence, setNewContainerConfidence] = useState<number | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [newItemConfidence, setNewItemConfidence] = useState<number | null>(null);
  const [newItemQuantity, setNewItemQuantity] = useState(1);

  // Export options
  const [exportOptions, setExportOptions] = useState({
    includeImages: false,
    includeDescriptions: true,
    includeCategories: true,
    includeConfidence: true,
    format: "csv" as "csv" | "json",
  });

  // Set state
  const [sets, setSets] = useState<Set[]>([]);
  const [currentSet, setCurrentSet] = useState<Set | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Set[]>([]);
  const [showAllItems, setShowAllItems] = useState(false);
  const [allSetItems, setAllSetItems] = useState<Item[]>([]);
  const [selectedSet, setSelectedSet] = useState<Set | null>(null);
  const [newSetName, setNewSetName] = useState("");
  const [newSetDescription, setNewSetDescription] = useState("");
  const [showCreateSet, setShowCreateSet] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ type: "container" | "set"; id: number } | null>(null);
  const [allSets, setAllSets] = useState<Set[]>([]);

  const containerInputRef = useRef<HTMLInputElement>(null);
  const itemInputRef = useRef<HTMLInputElement>(null);
  const setInputRef = useRef<HTMLInputElement>(null);

  const fetchContainers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/containers");
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch containers");
      }
      const data = await res.json();
      setContainers(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load containers";
      setError(errorMessage);
      console.error("Failed to fetch containers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSets = useCallback(async (parentId?: number | null) => {
    try {
      const param = parentId === null || parentId === undefined ? "null" : String(parentId);
      const res = await fetch(`/api/sets?parentId=${param}`);
      if (!res.ok) throw new Error("Failed to fetch sets");
      const data = await res.json();
      setSets(data);
    } catch (err) {
      console.error("Failed to fetch sets:", err);
    }
  }, []);

  const fetchAllSets = useCallback(async () => {
    try {
      const res = await fetch("/api/sets");
      if (!res.ok) throw new Error("Failed to fetch all sets");
      const data = await res.json();
      setAllSets(data);
    } catch (err) {
      console.error("Failed to fetch all sets:", err);
    }
  }, []);

  const fetchContainersForSet = useCallback(async (setId: number | null) => {
    try {
      const param = setId === null ? "null" : String(setId);
      const res = await fetch(`/api/containers?setId=${param}`);
      if (!res.ok) throw new Error("Failed to fetch containers");
      const data = await res.json();
      setContainers(data);
    } catch (err) {
      console.error("Failed to fetch containers:", err);
    }
  }, []);

  const fetchSetItems = useCallback(async (setId: number) => {
    try {
      const res = await fetch(`/api/sets/items?setId=${setId}`);
      if (!res.ok) throw new Error("Failed to fetch set items");
      const data = await res.json();
      setAllSetItems(data);
    } catch (err) {
      console.error("Failed to fetch set items:", err);
    }
  }, []);

  useEffect(() => {
    fetchSets(null);
    fetchContainersForSet(null);
  }, [fetchSets, fetchContainersForSet]);

  const fetchItems = async (containerId: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/items?containerId=${containerId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch items");
      }
      const data = await res.json();
      setItems(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load items";
      setError(errorMessage);
      console.error("Failed to fetch items:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleContainerImageCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const imageData = reader.result as string;
        setCapturedImage(imageData);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleItemImageCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const imageData = reader.result as string;
        setCapturedImage(imageData);
      };
      reader.readAsDataURL(file);
    }
  };

  const createContainer = async () => {
    if (!capturedImage || !newContainerName) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newContainerName,
          imageData: capturedImage,
          description: newContainerDescription || undefined,
          category: newContainerCategory || undefined,
          setId: currentSet?.id || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create container");
      }

      setCapturedImage(null);
      setNewContainerName("");
      setNewContainerDescription("");
      setNewContainerCategory("");
      setNewContainerConfidence(null);

      await fetchContainersForSet(currentSet?.id ?? null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create container";
      setError(errorMessage);
      console.error("Failed to create container:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateContainer = async () => {
    if (!selectedContainer) return;

    setLoading(true);
    setError(null);
    try {
      const body: any = {
        id: selectedContainer.id,
        name: newContainerName,
        description: newContainerDescription,
        category: newContainerCategory,
        confidence: newContainerConfidence,
      };

      if (capturedImage) {
        body.imageData = capturedImage;
      }

      const res = await fetch("/api/containers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to update container");

      setCapturedImage(null);
      setNewContainerName("");
      setNewContainerDescription("");
      setNewContainerCategory("");
      setNewContainerConfidence(null);

      setView("browse");
      await fetchContainersForSet(currentSet?.id ?? null);
    } catch (err) {
      setError("Failed to update container");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const createItem = async () => {
    if (!capturedImage || !newItemName || !selectedContainer) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          containerId: selectedContainer.id,
          name: newItemName,
          imageData: capturedImage,
          quantity: newItemQuantity || 1,
          description: newItemDescription || undefined,
          category: newItemCategory || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to create item");
      }

      setCapturedImage(null);
      setNewItemName("");
      setNewItemDescription("");
      setNewItemCategory("");
      setNewItemConfidence(null);
      setNewItemQuantity(1);

      await fetchItems(selectedContainer.id);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create item";
      setError(errorMessage);
      console.error("Failed to create item:", err);
    } finally {
      setLoading(false);
    }
  };

  const updateItem = async () => {
    if (!selectedItem) return;

    setLoading(true);
    setError(null);
    try {
      const body: any = {
        id: selectedItem.id,
        name: newItemName,
        description: newItemDescription,
        category: newItemCategory,
        confidence: newItemConfidence,
        quantity: newItemQuantity || 1,
      };

      if (capturedImage) {
        body.imageData = capturedImage;
      }

      const res = await fetch("/api/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to update item");

      setCapturedImage(null);
      setNewItemName("");
      setNewItemDescription("");
      setNewItemCategory("");
      setNewItemConfidence(null);
      setNewItemQuantity(1);

      setView("items");
      if (selectedContainer) {
        await fetchItems(selectedContainer.id);
      }
    } catch (err) {
      setError("Failed to update item");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Set CRUD functions
  const createSet = async () => {
    if (!newSetName) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: newSetName,
        description: newSetDescription || undefined,
        parentId: currentSet?.id || null,
      };
      if (capturedImage) {
        body.imageData = capturedImage;
      }
      const res = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create set");
      setShowCreateSet(false);
      setNewSetName("");
      setNewSetDescription("");
      setCapturedImage(null);
      await fetchSets(currentSet?.id ?? null);
    } catch (err) {
      setError("Failed to create set");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const updateSet = async () => {
    if (!selectedSet) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        id: selectedSet.id,
        name: newSetName,
        description: newSetDescription,
      };
      if (capturedImage) {
        body.imageData = capturedImage;
      }
      const res = await fetch("/api/sets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update set");
      setCapturedImage(null);
      setNewSetName("");
      setNewSetDescription("");
      setSelectedSet(null);
      setView("browse");
      await fetchSets(currentSet?.id ?? null);
    } catch (err) {
      setError("Failed to update set");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Navigation functions
  const navigateIntoSet = async (set: Set) => {
    setBreadcrumbs(prev => [...prev, set]);
    setCurrentSet(set);
    setShowAllItems(false);
    setSearchTerm("");
    await Promise.all([
      fetchSets(set.id),
      fetchContainersForSet(set.id),
    ]);
  };

  const navigateToBreadcrumb = async (index: number) => {
    if (index === -1) {
      setCurrentSet(null);
      setBreadcrumbs([]);
      setShowAllItems(false);
      setSearchTerm("");
      await Promise.all([fetchSets(null), fetchContainersForSet(null)]);
    } else {
      const target = breadcrumbs[index];
      setCurrentSet(target);
      setBreadcrumbs(prev => prev.slice(0, index + 1));
      setShowAllItems(false);
      setSearchTerm("");
      await Promise.all([fetchSets(target.id), fetchContainersForSet(target.id)]);
    }
  };

  const openEditSet = (set: Set) => {
    setSelectedSet(set);
    setNewSetName(set.name);
    setNewSetDescription(set.description || "");
    setView("edit-set");
  };

  // Move function
  const moveToSet = async (targetSetId: number | null) => {
    if (!moveTarget) return;
    setLoading(true);
    try {
      if (moveTarget.type === "container") {
        await fetch("/api/containers", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: moveTarget.id, setId: targetSetId }),
        });
      } else {
        await fetch("/api/sets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: moveTarget.id, parentId: targetSetId }),
        });
      }
      setShowMoveModal(false);
      setMoveTarget(null);
      await fetchSets(currentSet?.id ?? null);
      await fetchContainersForSet(currentSet?.id ?? null);
    } catch (err) {
      setError("Failed to move item");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openMoveModal = async (type: "container" | "set", id: number) => {
    setMoveTarget({ type, id });
    await fetchAllSets();
    setShowMoveModal(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setLoading(true);
    setError(null);
    try {
      const endpoint = deleteTarget.type === "container" ? "/api/containers"
        : deleteTarget.type === "item" ? "/api/items"
        : "/api/sets";
      const res = await fetch(`${endpoint}?id=${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error(`Failed to delete ${deleteTarget.type}`);

      setShowDeleteConfirm(false);
      setDeleteTarget(null);

      if (deleteTarget.type === "container") {
        await fetchContainersForSet(currentSet?.id ?? null);
        setSelectedContainer(null);
        setItems([]);
      } else if (deleteTarget.type === "set") {
        await fetchSets(currentSet?.id ?? null);
        await fetchContainersForSet(currentSet?.id ?? null);
      } else if (selectedContainer) {
        await fetchItems(selectedContainer.id);
      }
    } catch (err) {
      setError(`Failed to delete ${deleteTarget.type}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (type: "container" | "item" | "set", id: number) => {
    setDeleteTarget({ type, id });
    setShowDeleteConfirm(true);
  };

  const exportToCSV = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        includeImages: exportOptions.includeImages.toString(),
        includeDescriptions: exportOptions.includeDescriptions.toString(),
        includeCategories: exportOptions.includeCategories.toString(),
        includeConfidence: exportOptions.includeConfidence.toString(),
        format: exportOptions.format,
      });

      if (selectedContainer) {
        params.append("containerId", selectedContainer.id.toString());
      }

      const res = await fetch(`/api/export?${params}`);
      if (!res.ok) throw new Error("Failed to export");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory.${exportOptions.format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to export inventory");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const exportGallery = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedContainer) {
        params.append("containerId", selectedContainer.id.toString());
      }

      const res = await fetch(`/api/export-gallery?${params}`);
      if (!res.ok) throw new Error("Failed to export gallery");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inventory-gallery.html";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to export gallery");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openEditContainer = (container: Container) => {
    setSelectedContainer(container);
    setNewContainerName(container.name);
    setNewContainerDescription(container.description || "");
    setNewContainerCategory(container.category || "");
    setNewContainerConfidence(container.confidence || null);
    setView("edit-container");
  };

  const openEditItem = (item: Item) => {
    setSelectedItem(item);
    setNewItemName(item.name);
    setNewItemDescription(item.description || "");
    setNewItemCategory(item.category || "");
    setNewItemConfidence(item.confidence || null);
    setNewItemQuantity(item.quantity);
    setView("edit-item");
  };

  const resetForm = () => {
    setCapturedImage(null);
    setNewContainerName("");
    setNewContainerDescription("");
    setNewContainerCategory("");
    setNewContainerConfidence(null);
    setNewItemName("");
    setNewItemDescription("");
    setNewItemCategory("");
    setNewItemConfidence(null);
    setNewItemQuantity(1);
    setNewSetName("");
    setNewSetDescription("");
  };

  const filteredContainers = containers.filter(container =>
    container.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (container.description && container.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (container.category && container.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.category && item.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredSets = sets.filter(set =>
    set.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (set.description && set.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Photo Inventory</h1>
          <p className="text-gray-600">Manage your inventory with photos</p>
        </header>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={() => setError(null)} className="float-right font-bold">&times;</button>
          </div>
        )}

        {loading && (
          <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
            Loading...
          </div>
        )}

        {/* Export Options */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <h3 className="font-semibold mb-3">Export Options</h3>
          <div className="flex flex-wrap gap-4 mb-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={exportOptions.includeImages}
                onChange={(e) => setExportOptions({ ...exportOptions, includeImages: e.target.checked })}
                className="mr-2"
              />
              Include Images
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={exportOptions.includeDescriptions}
                onChange={(e) => setExportOptions({ ...exportOptions, includeDescriptions: e.target.checked })}
                className="mr-2"
              />
              Include Descriptions
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={exportOptions.includeCategories}
                onChange={(e) => setExportOptions({ ...exportOptions, includeCategories: e.target.checked })}
                className="mr-2"
              />
              Include Categories
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={exportOptions.includeConfidence}
                onChange={(e) => setExportOptions({ ...exportOptions, includeConfidence: e.target.checked })}
                className="mr-2"
              />
              Include Confidence
            </label>
          </div>
          <div className="flex gap-2">
            <select
              value={exportOptions.format}
              onChange={(e) => setExportOptions({ ...exportOptions, format: e.target.value as "csv" | "json" })}
              className="border px-3 py-2 rounded"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
            <button
              onClick={exportToCSV}
              disabled={loading}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              Export
            </button>
            <button
              onClick={exportGallery}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              Export HTML Gallery
            </button>
          </div>
        </div>

        {/* Browse View */}
        {view === "browse" && (
          <div>
            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
              <div className="flex items-center gap-2 text-sm mb-4 flex-wrap">
                <button onClick={() => navigateToBreadcrumb(-1)} className="text-blue-600 hover:text-blue-800">Home</button>
                {breadcrumbs.map((bc, i) => (
                  <span key={bc.id} className="flex items-center gap-2">
                    <span className="text-gray-400">/</span>
                    {i === breadcrumbs.length - 1 ? (
                      <span className="text-gray-700 font-medium">{bc.name}</span>
                    ) : (
                      <button onClick={() => navigateToBreadcrumb(i)} className="text-blue-600 hover:text-blue-800">{bc.name}</button>
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Header with buttons */}
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">{currentSet ? currentSet.name : "Inventory"}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setNewSetName("");
                    setNewSetDescription("");
                    setCapturedImage(null);
                    setShowCreateSet(true);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded"
                >
                  + Add Set
                </button>
                <button
                  onClick={() => containerInputRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                >
                  + Add Container
                </button>
              </div>
              <input
                ref={containerInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleContainerImageCapture}
                className="hidden"
              />
            </div>

            {/* Search bar */}
            <input
              type="text"
              placeholder="Search sets and containers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border px-4 py-2 rounded w-full mb-4"
            />

            {/* Flattened items toggle */}
            {currentSet && (
              <div className="mb-4">
                <button
                  onClick={async () => {
                    if (!showAllItems) {
                      await fetchSetItems(currentSet.id);
                    }
                    setShowAllItems(!showAllItems);
                  }}
                  className={`px-4 py-2 rounded text-sm ${
                    showAllItems
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                >
                  {showAllItems ? "Show Sets & Containers" : "Show All Items in Set"}
                </button>
              </div>
            )}

            {/* All items flat view */}
            {showAllItems && currentSet ? (
              <div>
                {allSetItems.length === 0 ? (
                  <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                    No items found in this set or its children.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {allSetItems.map(item => (
                      <div
                        key={item.id}
                        className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
                      >
                        <img
                          src={item.thumbnailUrl || item.imageData}
                          alt={item.name}
                          className="w-full h-48 object-cover"
                          loading="lazy"
                        />
                        <div className="p-4">
                          <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
                          {item.quantity > 1 && (
                            <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded mb-2">
                              Qty: {item.quantity}
                            </span>
                          )}
                          {item.category && (
                            <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mb-2">
                              {item.category}
                            </span>
                          )}
                          {item.description && (
                            <p className="text-gray-600 text-sm mb-2">{item.description}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div>
                {/* Sets grid */}
                {filteredSets.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-medium text-gray-700 mb-3">Sets</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredSets.map(set => (
                        <div
                          key={set.id}
                          className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow border-l-4 border-emerald-500"
                        >
                          {set.imageData ? (
                            <img
                              src={set.imageData}
                              alt={set.name}
                              className="w-full h-48 object-cover cursor-pointer"
                              loading="lazy"
                              onClick={() => navigateIntoSet(set)}
                            />
                          ) : (
                            <div
                              className="w-full h-48 bg-emerald-50 flex items-center justify-center cursor-pointer"
                              onClick={() => navigateIntoSet(set)}
                            >
                              <svg className="w-16 h-16 text-emerald-300" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                              </svg>
                            </div>
                          )}
                          <div className="p-4">
                            <h3 className="font-semibold text-lg mb-1">{set.name}</h3>
                            {set.description && (
                              <p className="text-gray-600 text-sm mb-2">{set.description}</p>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => navigateIntoSet(set)}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm"
                              >
                                Open
                              </button>
                              <button
                                onClick={() => openEditSet(set)}
                                className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-3 py-1 rounded text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => openMoveModal("set", set.id)}
                                className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                              >
                                Move
                              </button>
                              <button
                                onClick={() => confirmDelete("set", set.id)}
                                className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Containers grid */}
                {filteredContainers.length > 0 && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-700 mb-3">Containers</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredContainers.map(container => (
                        <div
                          key={container.id}
                          className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
                        >
                          <img
                            src={container.thumbnailUrl || container.imageData}
                            alt={container.name}
                            className="w-full h-48 object-cover cursor-pointer"
                            loading="lazy"
                            onClick={() => {
                              setSelectedContainer(container);
                              fetchItems(container.id);
                              setView("items");
                            }}
                          />
                          <div className="p-4">
                            <h3 className="font-semibold text-lg mb-1">{container.name}</h3>
                            {container.category && (
                              <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mb-2">
                                {container.category}
                              </span>
                            )}
                            {container.description && (
                              <p className="text-gray-600 text-sm mb-2">{container.description}</p>
                            )}
                            {container.confidence && (
                              <p className="text-xs text-gray-500 mb-2">
                                AI Confidence: {Math.round(container.confidence * 100)}%
                              </p>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setSelectedContainer(container);
                                  fetchItems(container.id);
                                  setView("items");
                                }}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm"
                              >
                                View Items
                              </button>
                              <button
                                onClick={() => openEditContainer(container)}
                                className="bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-3 py-1 rounded text-sm"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => openMoveModal("container", container.id)}
                                className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1 rounded text-sm"
                              >
                                Move
                              </button>
                              <button
                                onClick={() => confirmDelete("container", container.id)}
                                className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-sm"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {filteredSets.length === 0 && filteredContainers.length === 0 && (
                  <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                    {searchTerm ? "No sets or containers match your search" : "Nothing here yet. Add a set or container to get started!"}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Items View */}
        {view === "items" && selectedContainer && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <div>
                <button
                  onClick={() => {
                    setView("browse");
                    setSelectedContainer(null);
                    setItems([]);
                  }}
                  className="text-blue-600 hover:text-blue-800 mb-2"
                >
                  &larr; Back to {currentSet ? currentSet.name : "All"}
                </button>
                <h2 className="text-2xl font-semibold">Items in {selectedContainer.name}</h2>
              </div>
              <button
                onClick={() => itemInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                + Add Item
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

            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border px-4 py-2 rounded w-full mb-4"
            />

            {/* New Item Form - shows after capturing image */}
            {capturedImage && !selectedItem && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4">New Item</h3>
                <div className="flex gap-4 mb-4">
                  <img src={capturedImage} alt="New item" className="w-32 h-32 object-cover rounded" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Name</label>
                      <input
                        type="text"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        className="border px-3 py-2 rounded w-full"
                        placeholder="Item name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={newItemQuantity || ""}
                        onChange={(e) => setNewItemQuantity(e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                        className="border px-3 py-2 rounded w-24"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createItem}
                    disabled={loading || !newItemName}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    Save Item
                  </button>
                  <button
                    onClick={() => {
                      setCapturedImage(null);
                      setNewItemName("");
                      setNewItemQuantity(1);

                    }}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {filteredItems.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
                {searchTerm ? "No items match your search" : "No items yet. Click 'Add Item' to get started!"}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className="bg-white rounded-lg shadow overflow-hidden hover:shadow-lg transition-shadow"
                  >
                    <img
                      src={item.thumbnailUrl || item.imageData}
                      alt={item.name}
                      className="w-full h-48 object-cover"
                      loading="lazy"
                    />
                    <div className="p-4">
                      <h3 className="font-semibold text-lg mb-1">{item.name}</h3>
                      {item.quantity > 1 && (
                        <span className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded mb-2">
                          Qty: {item.quantity}
                        </span>
                      )}
                      {item.category && (
                        <span className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mb-2">
                          {item.category}
                        </span>
                      )}
                      {item.description && (
                        <p className="text-gray-600 text-sm mb-2">{item.description}</p>
                      )}
                      {item.confidence && (
                        <p className="text-xs text-gray-500 mb-2">
                          AI Confidence: {Math.round(item.confidence * 100)}%
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditItem(item)}
                          className="flex-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-3 py-1 rounded text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDelete("item", item.id)}
                          className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1 rounded text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Edit Container View */}
        {view === "edit-container" && selectedContainer && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4">Edit Container</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newContainerName}
                  onChange={(e) => setNewContainerName(e.target.value)}
                  className="border px-3 py-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={newContainerDescription}
                  onChange={(e) => setNewContainerDescription(e.target.value)}
                  className="border px-3 py-2 rounded w-full"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <input
                  type="text"
                  value={newContainerCategory}
                  onChange={(e) => setNewContainerCategory(e.target.value)}
                  className="border px-3 py-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">AI Confidence</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={newContainerConfidence || ""}
                  onChange={(e) => setNewContainerConfidence(e.target.value ? parseFloat(e.target.value) : null)}
                  className="border px-3 py-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Update Image</label>
                <button
                  onClick={() => containerInputRef.current?.click()}
                  className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
                >
                  Choose New Image
                </button>
                <input
                  ref={containerInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleContainerImageCapture}
                  className="hidden"
                />
                {capturedImage && (
                  <img src={capturedImage} alt="New image" className="mt-2 w-32 h-32 object-cover rounded" />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={updateContainer}
                  disabled={loading || !newContainerName}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    resetForm();
                    setView("browse");
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Item View */}
        {view === "edit-item" && selectedItem && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4">Edit Item</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="border px-3 py-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea
                  value={newItemDescription}
                  onChange={(e) => setNewItemDescription(e.target.value)}
                  className="border px-3 py-2 rounded w-full"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <input
                  type="text"
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="border px-3 py-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={newItemQuantity || ""}
                  onChange={(e) => setNewItemQuantity(e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                  className="border px-3 py-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">AI Confidence</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={newItemConfidence || ""}
                  onChange={(e) => setNewItemConfidence(e.target.value ? parseFloat(e.target.value) : null)}
                  className="border px-3 py-2 rounded w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Update Image</label>
                <button
                  onClick={() => itemInputRef.current?.click()}
                  className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
                >
                  Choose New Image
                </button>
                <input
                  ref={itemInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleItemImageCapture}
                  className="hidden"
                />
                {capturedImage && (
                  <img src={capturedImage} alt="New image" className="mt-2 w-32 h-32 object-cover rounded" />
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={updateItem}
                  disabled={loading || !newItemName}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  Save Changes
                </button>
                <button
                  onClick={() => {
                    resetForm();
                    setView("items");
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Set View */}
        {view === "edit-set" && selectedSet && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-2xl font-semibold mb-4">Edit Set</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input type="text" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} className="border px-3 py-2 rounded w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <textarea value={newSetDescription} onChange={(e) => setNewSetDescription(e.target.value)} className="border px-3 py-2 rounded w-full" rows={3} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Image (optional)</label>
                <button onClick={() => setInputRef.current?.click()} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded">Choose Image</button>
                <input ref={setInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => setCapturedImage(reader.result as string); reader.readAsDataURL(file); }}} className="hidden" />
                {(capturedImage || selectedSet.imageData) && (<img src={capturedImage || selectedSet.imageData} alt="Set image" className="mt-2 w-32 h-32 object-cover rounded" />)}
              </div>
              <div className="flex gap-2">
                <button onClick={updateSet} disabled={loading || !newSetName} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50">Save Changes</button>
                <button onClick={() => { resetForm(); setSelectedSet(null); setView("browse"); }} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded">Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Create Container Form */}
        {capturedImage && view === "browse" && !showCreateSet && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4">New Container</h3>
              <img src={capturedImage} alt="Captured" className="w-full h-48 object-cover rounded mb-4" />

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={newContainerName}
                    onChange={(e) => setNewContainerName(e.target.value)}
                    className="border px-3 py-2 rounded w-full"
                    placeholder="Container name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={newContainerDescription}
                    onChange={(e) => setNewContainerDescription(e.target.value)}
                    className="border px-3 py-2 rounded w-full"
                    rows={2}
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input
                    type="text"
                    value={newContainerCategory}
                    onChange={(e) => setNewContainerCategory(e.target.value)}
                    className="border px-3 py-2 rounded w-full"
                    placeholder="Optional category"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createContainer}
                    disabled={loading || !newContainerName}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    Save Container
                  </button>
                  <button
                    onClick={resetForm}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Item Form */}
        {capturedImage && view === "items" && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4">New Item</h3>
              <img src={capturedImage} alt="Captured" className="w-full h-48 object-cover rounded mb-4" />

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input
                    type="text"
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                    className="border px-3 py-2 rounded w-full"
                    placeholder="Item name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                    className="border px-3 py-2 rounded w-full"
                    rows={2}
                    placeholder="Optional description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category</label>
                  <input
                    type="text"
                    value={newItemCategory}
                    onChange={(e) => setNewItemCategory(e.target.value)}
                    className="border px-3 py-2 rounded w-full"
                    placeholder="Optional category"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={newItemQuantity || ""}
                    onChange={(e) => setNewItemQuantity(e.target.value === "" ? 0 : parseInt(e.target.value) || 0)}
                    className="border px-3 py-2 rounded w-full"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={createItem}
                    disabled={loading || !newItemName}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
                  >
                    Save Item
                  </button>
                  <button
                    onClick={resetForm}
                    className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Set Modal */}
        {showCreateSet && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
              <h3 className="text-xl font-semibold mb-4">New Set{currentSet ? ` in ${currentSet.name}` : ""}</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Name *</label>
                  <input type="text" value={newSetName} onChange={(e) => setNewSetName(e.target.value)} className="border px-3 py-2 rounded w-full" placeholder="Set name (e.g., First Floor, Bedroom)" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea value={newSetDescription} onChange={(e) => setNewSetDescription(e.target.value)} className="border px-3 py-2 rounded w-full" rows={2} placeholder="Optional description" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Image (optional)</label>
                  <button onClick={() => setInputRef.current?.click()} className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded text-sm">Choose Image</button>
                  <input ref={setInputRef} type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => setCapturedImage(reader.result as string); reader.readAsDataURL(file); }}} className="hidden" />
                  {capturedImage && <img src={capturedImage} alt="Preview" className="mt-2 w-32 h-32 object-cover rounded" />}
                </div>
                <div className="flex gap-2">
                  <button onClick={createSet} disabled={loading || !newSetName} className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50">Create Set</button>
                  <button onClick={() => { setShowCreateSet(false); setNewSetName(""); setNewSetDescription(""); setCapturedImage(null); }} className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Move-To Modal */}
        {showMoveModal && moveTarget && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
              <h3 className="text-xl font-semibold mb-4">Move to...</h3>
              <div className="space-y-2">
                <button onClick={() => moveToSet(null)} className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50 font-medium">
                  Top Level (unassigned)
                </button>
                {allSets.filter(s => s.id !== moveTarget.id).map(set => (
                  <button key={set.id} onClick={() => moveToSet(set.id)} className="w-full text-left px-4 py-3 rounded border hover:bg-gray-50">
                    {set.name}
                    {set.description && <span className="text-gray-500 text-sm ml-2">&mdash; {set.description}</span>}
                  </button>
                ))}
              </div>
              <button onClick={() => { setShowMoveModal(false); setMoveTarget(null); }} className="mt-4 w-full bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded">Cancel</button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && deleteTarget && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm w-full">
              <h3 className="text-xl font-semibold mb-4">Confirm Delete</h3>
              <p className="mb-6">
                Are you sure you want to delete this {deleteTarget.type}? This action cannot be undone.
                {deleteTarget.type === "container" && " All items in this container will also be deleted."}
                {deleteTarget.type === "set" && " Containers and child sets will be moved to the top level."}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteTarget(null);
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
