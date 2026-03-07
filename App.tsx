import React, { useState, useMemo, useEffect } from "react";
import { 
  Search,
  Plus,
  Truck as TruckIcon,
  List,
  LogOut,
  CheckCircle2,
  Clock,
  AlertCircle,
  Pencil,
  Trash2,
  X,
  Save,
  Box,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  AlertTriangle,
  Archive,
  Printer,
  FileText,
  CheckSquare,
  Tag,
  ArrowRightLeft,
  Database,
  Layers,
  Calendar,
  ClipboardList,
  Settings,
  Info,
  Package,
  User
} from "lucide-react";

// --- Supabase Setup ---
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://glnbrpmibxlovyhidshk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zW6SEClDZd0yQIBr9LfEjQ_jl_Ym5At';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Constants ---
const LOOM_SIZES = ["15000", "4200", "25000", "8500"];

// --- Interfaces ---
interface MasterItem {
  id: string;
  lineNo: string;
  itemNumber: string;
  orderedBoxes: number; 
  orderedQty: number;
}

interface PalletLineItem {
  id: string;
  lineNo: string;
  itemNumber: string;
  boxes: number;
  qtyPerBox: number;
  addedBy?: string;
}

interface PalletItem {
  id: string;
  number: number;
  boxes: number;
  weight: string;
  items: PalletLineItem[];
}

interface Order {
  id: string;
  status: "Completed" | "In Progress" | "Delayed" | string;
  po: string;
  freight: string;
  pallets: number;
  normalPallets?: number;
  loomPallets?: number;
  boxes: number;
  weight: string;
  notes?: string;
  looseBoxes?: number;
  shipmentDate?: string;
  truckId?: string;
  palletList?: PalletItem[]; 
  masterItems?: MasterItem[];
  isManualOverride?: boolean;
}

interface TruckData {
  id: string;
  summary: { pallets: number; weight: string; boxes: number; };
  orders: Order[];
}

interface DateGroup {
  date: string;
  trucks: TruckData[];
}

interface EditContext {
  orderId: string;
}

// --- Helpers ---
const formatForInput = (usDate: string) => {
  if (!usDate) return "";
  const [m, d, y] = usDate.split('/');
  if (y && m && d) {
    const fullYear = y.length === 2 ? `20${y}` : y;
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return usDate;
};

const formatFromInput = (isoDate: string) => {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split('-');
  if (y && m && d) return `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}`;
  return isoDate;
};

const getTodayUSFormat = () => {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
};

const parseDateStr = (dateStr: string) => {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split('/');
  if (parts.length === 3) {
      const [m, d, y] = parts;
      return new Date(Number(y), Number(m) - 1, Number(d));
  }
  return new Date(dateStr);
};

const isLoomPallet = (p: PalletItem) => {
  return p.items.some(i => i.boxes === 0 && LOOM_SIZES.includes(String(i.qtyPerBox)));
};

// Mock Data Generator
const getMockOrders = (): Order[] => {
  const todayStr = getTodayUSFormat();
  const futureStr = "12/25/2026";
  return [
    { id: "ORD-1001", status: "Completed", po: "PO-001", freight: "Prepaid", pallets: 2, normalPallets: 2, loomPallets: 0, boxes: 10, weight: "1500.00", shipmentDate: todayStr, truckId: "Truck 1", palletList: [], masterItems: [], isManualOverride: true },
    { id: "ORD-1002", status: "In Progress", po: "PO-002", freight: "Collect", pallets: 4, normalPallets: 3, loomPallets: 1, boxes: 25, weight: "3200.00", shipmentDate: todayStr, truckId: "Truck 1", palletList: [], masterItems: [], isManualOverride: true },
    { id: "ORD-1003", status: "In Progress", po: "PO-003", freight: "CPT", pallets: 1, normalPallets: 1, loomPallets: 0, boxes: 5, weight: "800.00", shipmentDate: todayStr, truckId: "Unassigned", palletList: [], masterItems: [], isManualOverride: true },
    { id: "ORD-1004", status: "Delayed", po: "URGENT-004", freight: "PPD and Charge", pallets: 5, normalPallets: 5, loomPallets: 0, boxes: 40, weight: "5000.00", shipmentDate: todayStr, truckId: "Truck 2", palletList: [], masterItems: [], isManualOverride: true },
    { id: "ORD-1005", status: "In Progress", po: "PO-005", freight: "Prepaid", pallets: 8, normalPallets: 6, loomPallets: 2, boxes: 60, weight: "8500.00", shipmentDate: futureStr, truckId: "Truck 3", palletList: [], masterItems: [], isManualOverride: true }
  ];
};

// --- Main Component ---
export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState("Order Summary");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [expandedTrucks, setExpandedTrucks] = useState<Record<string, boolean>>({});
  const [expandedPallets, setExpandedPallets] = useState<Record<string, boolean>>({});
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [activeOrderContext, setActiveOrderContext] = useState<EditContext | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void} | null>(null);
  const [editingPalletId, setEditingPalletId] = useState<string | null>(null);
  const [movingPalletId, setMovingPalletId] = useState<string | null>(null);
  const [targetPosition, setTargetPosition] = useState<number>(1);
  const [lineItemForm, setLineItemForm] = useState<PalletLineItem>({ id: "", lineNo: "", itemNumber: "", boxes: 0, qtyPerBox: 0 });
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [newOrderForm, setNewOrderForm] = useState({ id: "", po: "", shipmentDate: "", freight: "Select Freight Terms", truckId: "N/A", notes: "" });
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkTab, setBulkTab] = useState<'looms'|'standard'>('looms');
  const [bulkForm, setBulkForm] = useState({ loomSize: "15000", lineNo: "1", numPallets: "", weight: "", itemNo: "", boxes: "", qtyPerBox: "" });
  const [detailsTab, setDetailsTab] = useState<'general' | 'packing_list' | 'weight_sheet' | 'items' | 'order_check'>('general');
  const [newItemNumberForm, setNewItemNumberForm] = useState("");
  const [printMode, setPrintMode] = useState<'none' | 'labels_all' | 'pallet_sheets_all' | 'packing_list' | 'weight_sheet' | 'label_single' | 'pallet_sheet_single' | 'truck_report'>('none');
  const [printTargetPallet, setPrintTargetPallet] = useState<PalletItem | null>(null);
  const [reportDate, setReportDate] = useState(getTodayUSFormat());

  // --- Supabase: Load + Realtime ---
  useEffect(() => {
    const loadOrders = async () => {
      const { data, error } = await supabase.from('orders').select('*');
      if (error) { console.error('Supabase load error:', error); return; }
      if (data && data.length > 0) {
        setOrders(data.map((row: any) => row.data as Order));
        setExpandedDates(prev => ({ ...prev, [getTodayUSFormat()]: true }));
      } else {
        const mocks = getMockOrders();
        for (const m of mocks) {
          await supabase.from('orders').upsert({ id: m.id, data: m });
        }
        setExpandedDates(prev => ({ ...prev, [getTodayUSFormat()]: true, "12/25/2026": true }));
        setExpandedTrucks(prev => ({ ...prev, [`${getTodayUSFormat()}-Truck 1`]: true }));
      }
    };
    loadOrders();

    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const order = payload.new.data as Order;
          setOrders(prev => {
            const exists = prev.some(o => o.id === order.id);
            if (exists) return prev.map(o => o.id === order.id ? order : o);
            return [...prev, order];
          });
        } else if (payload.eventType === 'DELETE') {
          setOrders(prev => prev.filter(o => o.id !== (payload.old as any).id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const saveOrderToCloud = async (order: Order) => {
    const { error } = await supabase.from('orders').upsert({ id: order.id, data: order });
    if (error) console.error('Save error:', error);
  };

  const deleteOrderFromCloud = async (orderId: string) => {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) console.error('Delete error:', error);
  };

  // --- Dynamic Grouping Logic ---
  const { activeDates, pastCompletedDates, delayedOrdersList } = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    const filtered = orders.filter(o => 
      (o.id || '').toLowerCase().includes(searchLower) || 
      (o.po || '').toLowerCase().includes(searchLower)
    );
    const delayed = filtered.filter(o => o.status === 'Delayed');
    const active = filtered.filter(o => o.status !== 'Delayed');
    const groups: Record<string, Record<string, Order[]>> = {};
    active.forEach(o => {
      const dStr = o.shipmentDate || 'Unscheduled';
      const tStr = o.truckId || 'Unassigned';
      if (!groups[dStr]) groups[dStr] = {};
      if (!groups[dStr][tStr]) groups[dStr][tStr] = [];
      groups[dStr][tStr].push(o);
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeGroups: DateGroup[] = [];
    const pastGroups: DateGroup[] = [];
    Object.entries(groups).forEach(([date, trucksMap]) => {
      const orderDate = date === 'Unscheduled' ? today : parseDateStr(date);
      const trucks = Object.entries(trucksMap).map(([tid, ords]) => ({
        id: tid,
        orders: ords,
        summary: {
          pallets: ords.reduce((s, o) => s + (Number(o.pallets)||0), 0),
          boxes: ords.reduce((s, o) => s + (Number(o.boxes)||0), 0),
          weight: ords.reduce((s, o) => s + parseFloat(String(o.weight||"0").replace(/,/g, '')||"0"), 0).toFixed(2)
        }
      })).sort((a, b) => a.id.localeCompare(b.id));
      const isOld = orderDate < today;
      const allCompleted = trucks.every(t => t.orders.every(o => o.status === 'Completed'));
      if (isOld && allCompleted) {
        pastGroups.push({ date, trucks });
      } else {
        activeGroups.push({ date, trucks });
      }
    });
    activeGroups.sort((a, b) => parseDateStr(a.date).getTime() - parseDateStr(b.date).getTime());
    pastGroups.sort((a, b) => parseDateStr(b.date).getTime() - parseDateStr(a.date).getTime());
    return { activeDates: activeGroups, pastCompletedDates: pastGroups, delayedOrdersList: delayed };
  }, [orders, searchTerm]);

  // --- Auto-Save Effect ---
  useEffect(() => {
    if (!editingOrder) return;
    let finalOrder = { ...editingOrder };
    let updatedTotals = false;
    if (activeTab === "Order Details" && !finalOrder.isManualOverride) {
      const list = finalOrder.palletList || [];
      let normalP = 0, loomP = 0;
      list.forEach(p => { if (isLoomPallet(p)) loomP++; else normalP++; });
      const weightSum = list.reduce((s, p) => s + parseFloat(String(p.weight || "0").replace(/,/g, '')||"0"), 0);
      const boxSum = list.reduce((s, p) => s + (Number(p.boxes)||0), 0) + (Number(finalOrder.looseBoxes) || 0);
      if (finalOrder.pallets !== list.length || finalOrder.boxes !== boxSum || finalOrder.weight !== weightSum.toFixed(2) || finalOrder.normalPallets !== normalP || finalOrder.loomPallets !== loomP) {
        finalOrder.pallets = list.length;
        finalOrder.normalPallets = normalP;
        finalOrder.loomPallets = loomP;
        finalOrder.boxes = boxSum;
        finalOrder.weight = weightSum.toFixed(2);
        updatedTotals = true;
      }
    }
    if (updatedTotals) { setEditingOrder(finalOrder); return; }
    setOrders(prev => prev.map(o => o.id === finalOrder.id ? finalOrder : o));
    saveOrderToCloud(finalOrder);
  }, [editingOrder]);

  // --- Totals Functions ---
  const totals = useMemo(() => {
    if (!editingOrder) return { pallets: 0, normalPallets: 0, loomPallets: 0, boxes: 0, weight: 0 };
    if (editingOrder.isManualOverride && activeTab === "Order Summary") {
      return { pallets: editingOrder.pallets, normalPallets: editingOrder.normalPallets || editingOrder.pallets, loomPallets: editingOrder.loomPallets || 0, boxes: editingOrder.boxes, weight: parseFloat(editingOrder.weight || "0") };
    }
    const list = editingOrder.palletList || [];
    let normalP = 0, loomP = 0;
    list.forEach(p => { if (isLoomPallet(p)) loomP++; else normalP++; });
    const weightSum = list.reduce((s, p) => s + parseFloat(String(p.weight || "0").replace(/,/g, '') || "0"), 0);
    const boxSum = list.reduce((s, p) => s + (Number(p.boxes) || 0), 0) + (Number(editingOrder.looseBoxes) || 0);
    return { pallets: list.length, normalPallets: normalP, loomPallets: loomP, boxes: boxSum, weight: weightSum };
  }, [editingOrder, activeTab]);

  const getPackedQtyForLine = (lineNo: string, order: Order | null) => {
    if (!order?.palletList) return 0;
    let total = 0;
    order.palletList.forEach(p => (p.items || []).forEach(i => { 
      if (i.lineNo === lineNo) {
        const isLoom = i.boxes === 0 && LOOM_SIZES.includes(String(i.qtyPerBox));
        total += isLoom ? Number(i.qtyPerBox) : (Number(i.boxes)||0) * (Number(i.qtyPerBox)||0);
      }
    }));
    return total;
  };

  const getPackedBoxesForLine = (lineNo: string, order: Order | null) => {
    if (!order?.palletList) return 0;
    let total = 0;
    order.palletList.forEach(p => (p.items || []).forEach(i => { 
      if (i.lineNo === lineNo) {
        const isLoom = i.boxes === 0 && LOOM_SIZES.includes(String(i.qtyPerBox));
        total += isLoom ? 1 : (Number(i.boxes)||0);
      }
    }));
    return total;
  };

  const getBackorders = (order: Order) => {
    if (!order.masterItems || order.masterItems.length === 0) return [];
    const backorders: {lineNo: string, missingQty: number, missingBoxes: number}[] = [];
    order.masterItems.forEach(m => {
      const packedQty = getPackedQtyForLine(m.lineNo, order);
      const packedBoxes = getPackedBoxesForLine(m.lineNo, order);
      const mQty = Number(m.orderedQty) || 0;
      const mBoxes = Number(m.orderedBoxes) || 0;
      if ((mQty > 0 && packedQty < mQty) || (mBoxes > 0 && packedBoxes < mBoxes)) {
        backorders.push({ lineNo: m.lineNo, missingQty: Math.max(0, mQty - packedQty), missingBoxes: Math.max(0, mBoxes - packedBoxes) });
      }
    });
    return backorders;
  };

  const checkOrderIncomplete = (order: Order) => getBackorders(order).length > 0;

  const reportDateData = useMemo(() => {
    return activeDates.find(d => formatForInput(d.date) === formatForInput(reportDate));
  }, [activeDates, reportDate]);

  const truckReportSummary = useMemo(() => {
    let grandTrucks = 0, grandLoomPlts = 0, grandNormalPlts = 0, grandBoxes = 0, grandWeight = 0;
    const trucks = (reportDateData?.trucks || []).map(t => {
      let tLoom = 0, tNormal = 0, tBoxes = 0, tWeight = 0;
      const ordersData = (t.orders || []).map(o => {
        let oLoom = 0, oNormal = 0;
        (o.palletList || []).forEach(p => {
          const isLoom = (p.items || []).some(i => LOOM_SIZES.includes(i.itemNumber || ""));
          if(isLoom) oLoom++; else oNormal++;
        });
        tLoom += oLoom; tNormal += oNormal;
        const calcWeight = (o.palletList || []).reduce((acc, p) => acc + parseFloat(String(p.weight||"0").replace(/,/g, '')||"0"), 0);
        const calcBoxes = (o.palletList || []).reduce((acc, p) => acc + (Number(p.boxes)||0), 0);
        const finalBoxes = o.isManualOverride ? (Number(o.boxes) || 0) : calcBoxes;
        const manualW = parseFloat(String(o.weight||"0").replace(/,/g, ''));
        const finalWeight = o.isManualOverride ? (isNaN(manualW) ? 0 : manualW) : calcWeight;
        tBoxes += finalBoxes; tWeight += finalWeight;
        return { ...o, loomPlts: oLoom, normalPlts: oNormal, finalBoxes, finalWeight };
      });
      grandTrucks++; grandLoomPlts += tLoom; grandNormalPlts += tNormal; grandBoxes += tBoxes; grandWeight += tWeight;
      return { ...t, ordersData, tLoom, tNormal, tBoxes, tWeight };
    });
    return { trucks, grandTrucks, grandLoomPlts, grandNormalPlts, grandBoxes, grandWeight };
  }, [reportDateData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const user = fd.get('username') as string;
    if(user.trim()) setCurrentUser(user);
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrderForm.id || !newOrderForm.shipmentDate) return;
    const formatted = formatFromInput(newOrderForm.shipmentDate);
    const assignedTruck = newOrderForm.truckId === "N/A" ? "Unassigned" : newOrderForm.truckId;
    const newOrder: Order = { 
      ...newOrderForm, id: newOrderForm.id, shipmentDate: formatted, status: "In Progress", 
      pallets: 0, normalPallets: 0, loomPallets: 0, boxes: 0, weight: "0.00", truckId: assignedTruck, palletList: [], masterItems: [], isManualOverride: false
    };
    setOrders(prev => {
       if (prev.some(o => o.id === newOrder.id)) return prev;
       return [...prev, newOrder];
    });
    saveOrderToCloud(newOrder);
    setEditingOrder(newOrder);
    setActiveOrderContext({ orderId: newOrder.id });
    setDetailsTab('general');
    setActiveTab("Order Details");
    setNewOrderForm({ id: "", po: "", shipmentDate: "", freight: "Select Freight Terms", truckId: "N/A", notes: "" });
  };

  const executeDeleteOrder = async (context: EditContext) => {
    setOrders(prev => prev.filter(o => o.id !== context.orderId));
    await deleteOrderFromCloud(context.orderId);
    setConfirmDialog(null);
  };

  const openFullDetails = (order: Order) => {
    setEditingOrder({ ...order });
    setActiveOrderContext({ orderId: order.id });
    setDetailsTab('general');
    setActiveTab("Order Details");
    setEditingPalletId(null);
  };

  const openQuickEdit = (order: Order) => {
    setEditingOrder({ ...order });
    setActiveOrderContext({ orderId: order.id });
    setIsQuickEditOpen(true);
  };

  const closeAndNavigateSummary = () => {
    setIsQuickEditOpen(false);
    if (activeTab === "Order Details") setActiveTab("Order Summary");
  };

  const handleInputChange = (field: keyof Order, value: any) => {
    if (editingOrder) setEditingOrder({ ...editingOrder, [field]: value });
  };

  const handleOrderCheckKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll('.order-check-input')) as HTMLInputElement[];
      const index = inputs.indexOf(e.currentTarget);
      if (index >= 0 && index < inputs.length - 1) inputs[index + 1].focus();
    }
  };

  const toggleDate = (date: string) => setExpandedDates(p => ({ ...p, [date]: !p[date] }));
  const toggleTruck = (date: string, tid: string) => setExpandedTrucks(p => ({ ...p, [`${date}-${tid}`]: !p[`${date}-${tid}`] }));

  const handleAddMasterItem = () => {
    if (!editingOrder || !newItemNumberForm.trim()) return;
    const currentLines = editingOrder.masterItems || [];
    const nextLineNo = currentLines.length > 0 ? Math.max(...currentLines.map(m => parseInt(m.lineNo) || 0)) + 1 : 1;
    const newMaster: MasterItem = { id: `m_${Date.now()}`, lineNo: nextLineNo.toString(), itemNumber: newItemNumberForm, orderedBoxes: 0, orderedQty: 0 };
    setEditingOrder({ ...editingOrder, masterItems: [...currentLines, newMaster] });
    setNewItemNumberForm("");
  };

  const handleUpdateMasterItem = (id: string, field: keyof MasterItem, value: any) => {
    if (!editingOrder) return;
    setEditingOrder({ ...editingOrder, masterItems: editingOrder.masterItems?.map(m => m.id === id ? { ...m, [field]: value } : m) });
  };

  const handleDeleteMasterItem = (id: string) => {
    if (!editingOrder) return;
    setConfirmDialog({
      isOpen: true, title: "Delete Item", message: "Are you sure you want to remove this item from the list?",
      onConfirm: () => {
        setEditingOrder({ ...editingOrder, masterItems: editingOrder.masterItems?.filter(m => m.id !== id) });
        setConfirmDialog(null);
      }
    });
  };

  const handleAddPallet = () => {
    if (!editingOrder) return;
    const list = editingOrder.palletList || [];
    const nextNum = list.length > 0 ? Math.max(...list.map(p => p.number)) + 1 : 1;
    const newPallet: PalletItem = { id: `p_${Date.now()}`, number: nextNum, boxes: 0, weight: "0.00", items: [] };
    setEditingOrder({ ...editingOrder, palletList: [...list, newPallet] });
  };

  const executeDeletePallet = (pid: string) => {
    if (!editingOrder) return;
    const filteredList = editingOrder.palletList?.filter(p => p.id !== pid) || [];
    const reorganizedList = filteredList.map((p, index) => ({ ...p, number: index + 1 }));
    setEditingOrder({ ...editingOrder, palletList: reorganizedList });
    setConfirmDialog(null);
  };

  const handleSaveLineItem = () => {
    if (!editingOrder || !editingPalletId || !lineItemForm.itemNumber) return;
    setEditingOrder(prev => {
      if (!prev) return prev;
      const updatedPallets = prev.palletList?.map(p => {
        if (p.id !== editingPalletId) return p;
        const items = editingLineItemId 
          ? (p.items || []).map(i => i.id === editingLineItemId ? { ...lineItemForm, addedBy: i.addedBy || currentUser || 'Unknown' } : i) 
          : [...(p.items || []), { ...lineItemForm, id: `li_${Date.now()}`, addedBy: currentUser || 'Unknown' }];
        return { ...p, items, boxes: items.reduce((s, i) => s + (Number(i.boxes)||0), 0) };
      });
      return { ...prev, palletList: updatedPallets };
    });
    setLineItemForm({ id: "", lineNo: "", itemNumber: "", boxes: 0, qtyPerBox: 0 });
    setEditingLineItemId(null);
  };

  const handleLineNoChange = (val: string) => {
    setLineItemForm(prev => {
      const masterItem = editingOrder?.masterItems?.find(m => m.lineNo === val);
      return { ...prev, lineNo: val, itemNumber: masterItem ? masterItem.itemNumber : prev.itemNumber };
    });
  };

  const handleBulkLineNoChange = (val: string) => {
    const masterItem = editingOrder?.masterItems?.find(m => m.lineNo === val);
    setBulkForm(prev => ({ ...prev, lineNo: val, itemNo: masterItem ? masterItem.itemNumber : prev.itemNo }));
  };

  const executeMovePallet = () => {
    if (!editingOrder || !editingOrder.palletList || !movingPalletId) return;
    const currentList = [...editingOrder.palletList];
    const currentIndex = currentList.findIndex(p => p.id === movingPalletId);
    if(currentIndex === -1) return;
    let newPos = targetPosition - 1;
    if(newPos < 0) newPos = 0;
    if(newPos >= currentList.length) newPos = currentList.length - 1;
    const [removed] = currentList.splice(currentIndex, 1);
    currentList.splice(newPos, 0, removed);
    const reorganizedList = currentList.map((p, index) => ({ ...p, number: index + 1 }));
    setEditingOrder({ ...editingOrder, palletList: reorganizedList });
    setMovingPalletId(null);
  };

  const handleProcessBulkAdd = () => {
    if (!editingOrder) return;
    const list = [...(editingOrder.palletList || [])];
    let nextNum = list.length > 0 ? Math.max(...list.map(p => p.number)) + 1 : 1;
    const count = parseInt(bulkForm.numPallets) || 0;
    if (count <= 0) return;
    for(let i=0; i<count; i++) {
        const b = bulkTab === 'looms' ? 0 : parseInt(bulkForm.boxes) || 0; 
        const q = bulkTab === 'looms' ? parseInt(bulkForm.loomSize) : parseInt(bulkForm.qtyPerBox) || 0;
        const newItem: PalletLineItem = { id: `li_${Date.now()}_${i}`, lineNo: bulkForm.lineNo, itemNumber: bulkTab === 'looms' ? bulkForm.loomSize : bulkForm.itemNo, boxes: b, qtyPerBox: q, addedBy: currentUser || 'System' };
        list.push({ id: `p_${Date.now()}_${i}`, number: nextNum++, boxes: b, weight: bulkTab === 'looms' ? bulkForm.weight : "0.00", items: [newItem] });
    }
    setEditingOrder({...editingOrder, palletList: list});
    setIsBulkModalOpen(false);
  };

  const triggerPrint = (mode: typeof printMode) => {
    setPrintMode(mode);
    setTimeout(() => { window.print(); }, 500);
  };

  const printPalletSheet = (pallet: PalletItem) => {
    setPrintTargetPallet(pallet);
    triggerPrint('pallet_sheet_single');
  };

  const printLabel = (pallet: PalletItem) => {
    setPrintTargetPallet(pallet);
    triggerPrint('label_single');
  };

  const renderOrderCard = (order: Order, isReadOnly: boolean = false) => {
    const isDelayed = order.status === 'Delayed';
    const isCompleted = order.status === 'Completed';
    const totalP = order.isManualOverride ? order.pallets : (order.normalPallets || 0) + (order.loomPallets || 0);
    return (
      <div 
        key={order.id} 
        onClick={() => openFullDetails(order)}
        className={`bg-white rounded-2xl border-2 transition-all w-full sm:w-[320px] flex-shrink-0 hover:shadow-xl hover:border-indigo-400 cursor-pointer relative overflow-hidden group ${isDelayed ? 'border-red-100 shadow-red-50' : 'border-slate-100'}`}
      >
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isCompleted ? 'bg-emerald-500' : isDelayed ? 'bg-red-500' : 'bg-amber-500'}`} />
        <div className="p-5">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 mb-1 ${isCompleted ? 'text-emerald-600' : isDelayed ? 'text-red-600' : 'text-amber-600'}`}>
                {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : isDelayed ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                {order.status}
              </span>
              <h3 className="text-slate-900 font-extrabold text-base group-hover:text-indigo-600 transition-colors">{order.id}</h3>
            </div>
            {!isReadOnly && (
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => openQuickEdit(order)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Quick Edit"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => setConfirmDialog({isOpen:true, title:"Delete Order", message:"Are you sure you want to delete this order?", onConfirm:() => executeDeleteOrder({ orderId: order.id })})} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete"><Trash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>
          {checkOrderIncomplete(order) && !isReadOnly && (
             <div className="mt-2 space-y-0.5 mb-2">
                {getBackorders(order).map((bo, idx) => (
                  <p key={idx} className="text-[11px] text-red-600 font-bold uppercase tracking-wider">
                    BO: Line {bo.lineNo} (Missing {bo.missingQty > 0 ? bo.missingQty + ' pcs' : bo.missingBoxes + ' bxs/plts'})
                  </p>
                ))}
             </div>
          )}
          <div className="space-y-1.5 text-[13px] text-slate-500 border-t border-slate-100 pt-4">
            <div className="flex justify-between"><span className="font-medium">PO:</span> <span className="text-slate-800 font-bold">{order.po || "N/A"}</span></div>
            <div className="flex justify-between"><span className="font-medium">Truck:</span> <span className="text-indigo-600 font-bold">{order.truckId || "Unassigned"}</span></div>
            <div className="flex gap-3 mt-3">
               <div className="flex-1 bg-slate-50 p-2 rounded-xl text-center"><p className="text-[9px] font-black text-slate-400 uppercase">Plts</p><p className="font-black text-slate-900">{totalP} {order.loomPallets ? <span className="text-[10px] text-gray-500 font-medium">({order.loomPallets} Lm)</span> : ""}</p></div>
               <div className="flex-1 bg-slate-50 p-2 rounded-xl text-center"><p className="text-[9px] font-black text-slate-400 uppercase">Boxes</p><p className="font-black text-slate-900">{order.boxes}</p></div>
               <div className="flex-1 bg-slate-50 p-2 rounded-xl text-center"><p className="text-[9px] font-black text-slate-400 uppercase">Lbs</p><p className="font-black text-indigo-600">{Number(order.weight||0).toFixed(0)}</p></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // -------------------------------------------------------------------------
  // RENDER: LOGIN
  // -------------------------------------------------------------------------
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#f4f6f8] flex items-center justify-center font-sans">
        <div className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-sm border border-gray-100">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center"><User className="w-8 h-8"/></div>
          </div>
          <h1 className="text-2xl font-black text-center text-gray-800 mb-2">Welcome Back</h1>
          <p className="text-center text-gray-500 text-sm mb-8">Please enter your name to continue</p>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">Username</label>
              <input name="username" autoFocus required className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="e.g., John Doe" />
            </div>
            <button type="submit" className="w-full bg-[#1e6acb] hover:bg-blue-700 text-white py-3 rounded-lg font-bold shadow-md transition-colors">Login to System</button>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: PRINT PREVIEW MODE
  // -------------------------------------------------------------------------
  if (printMode !== 'none') {
    return (
      <div className="bg-white min-h-screen text-black">
        <div className="print:hidden fixed top-4 right-4 z-50 flex gap-2">
           <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded shadow-lg font-bold">Print</button>
           <button onClick={() => setPrintMode('none')} className="bg-gray-800 text-white px-4 py-2 rounded shadow-lg font-bold">Close Preview</button>
        </div>
        {(printMode === 'labels_all' && editingOrder?.palletList) && editingOrder.palletList.map(p => (
          <div key={p.id} className="label-page flex flex-col justify-center items-center text-center border-b border-gray-300 print:border-none" style={{ width: '4in', height: '2in', padding: '0.2in', boxSizing: 'border-box', fontFamily: 'sans-serif' }}>
            <h1 style={{ margin: '0 0 5px 0', fontSize: '26px', fontWeight: '900' }}>Order: {editingOrder.id}</h1>
            <p style={{ margin: '0 0 8px 0', fontSize: '16px' }}>PO: {editingOrder.po || 'N/A'}</p>
            <h2 style={{ margin: '0 0 5px 0', fontSize: '22px', fontWeight: 'bold' }}>Pallet {p.number} {isLoomPallet(p) ? '(Loom)' : ''}</h2>
            <p style={{ margin: '0', fontSize: '14px' }}>Ship Date: {editingOrder.shipmentDate}</p>
          </div>
        ))}
        {(printMode === 'label_single' && printTargetPallet) && (
          <div className="label-page flex flex-col justify-center items-center text-center border-b border-gray-300 print:border-none" style={{ width: '4in', height: '2in', padding: '0.2in', boxSizing: 'border-box', fontFamily: 'sans-serif' }}>
            <h1 style={{ margin: '0 0 5px 0', fontSize: '26px', fontWeight: '900' }}>Order: {editingOrder?.id}</h1>
            <p style={{ margin: '0 0 8px 0', fontSize: '16px' }}>PO: {editingOrder?.po || 'N/A'}</p>
            <h2 style={{ margin: '0 0 5px 0', fontSize: '22px', fontWeight: 'bold' }}>Pallet {printTargetPallet.number} {isLoomPallet(printTargetPallet) ? '(Loom)' : ''}</h2>
            <p style={{ margin: '0', fontSize: '14px' }}>Ship Date: {editingOrder?.shipmentDate}</p>
          </div>
        )}
        {(printMode === 'pallet_sheets_all' && editingOrder?.palletList) && editingOrder.palletList.map(pallet => (
          <div key={pallet.id} className="sheet-page p-10 font-sans mx-auto max-w-[8.5in] min-h-[11in] border-b border-gray-300 print:border-none">
            <h1 className="text-center text-2xl font-bold mb-8">Pallet Details: Pallet {pallet.number} {isLoomPallet(pallet) ? '(Loom)' : ''}</h1>
            <div className="border border-gray-300 p-5 rounded-lg mb-8 bg-gray-50">
              <p className="mb-1"><b>Order #:</b> {editingOrder.id}</p><p className="mb-1"><b>PO:</b> {editingOrder.po}</p>
              <p className="mb-1"><b>Ship Date:</b> {editingOrder.shipmentDate}</p><p className="mb-1"><b>Pallet Weight:</b> {pallet.weight} lbs</p>
            </div>
            <h3 className="text-lg font-bold mb-4">Items on Pallet</h3>
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-gray-100"><th className="p-2 border-b-2 border-gray-300 text-sm">LINE</th><th className="p-2 border-b-2 border-gray-300 text-sm">ITEM #</th><th className="p-2 border-b-2 border-gray-300 text-sm text-center">BOXES / PLT</th><th className="p-2 border-b-2 border-gray-300 text-sm text-center">QTY/BOX</th><th className="p-2 border-b-2 border-gray-300 text-sm text-right">TOTAL PCS</th></tr></thead>
              <tbody>{(pallet.items || []).map(i => {
                const isLoom = i.boxes === 0 && LOOM_SIZES.includes(String(i.qtyPerBox));
                const bxs = isLoom ? 1 : i.boxes;
                return (<tr key={i.id}><td className="p-2 border-b border-gray-200">{i.lineNo}</td><td className="p-2 border-b border-gray-200">{i.itemNumber}</td><td className="p-2 border-b border-gray-200 text-center">{bxs}</td><td className="p-2 border-b border-gray-200 text-center">{(Number(i.qtyPerBox)||0).toLocaleString()}</td><td className="p-2 border-b border-gray-200 text-right">{(bxs * (Number(i.qtyPerBox)||0)).toLocaleString()}</td></tr>)
              })}</tbody>
            </table>
            {!isLoomPallet(pallet) && <h3 className="text-right mt-6 font-bold">Total Boxes on Pallet: {pallet.boxes}</h3>}
          </div>
        ))}
        {(printMode === 'pallet_sheet_single' && printTargetPallet) && (
          <div className="sheet-page p-10 font-sans mx-auto max-w-[8.5in] min-h-[11in]">
            <h1 className="text-center text-2xl font-bold mb-8">Pallet Details: Pallet {printTargetPallet.number} {isLoomPallet(printTargetPallet) ? '(Loom)' : ''}</h1>
            <div className="border border-gray-300 p-5 rounded-lg mb-8 bg-gray-50"><p className="mb-1"><b>Order #:</b> {editingOrder?.id}</p><p className="mb-1"><b>PO:</b> {editingOrder?.po}</p><p className="mb-1"><b>Ship Date:</b> {editingOrder?.shipmentDate}</p><p className="mb-1"><b>Pallet Weight:</b> {printTargetPallet.weight} lbs</p></div>
            <h3 className="text-lg font-bold mb-4">Items on Pallet</h3>
            <table className="w-full text-left border-collapse">
              <thead><tr className="bg-gray-100"><th className="p-2 border-b-2 border-gray-300 text-sm">LINE</th><th className="p-2 border-b-2 border-gray-300 text-sm">ITEM #</th><th className="p-2 border-b-2 border-gray-300 text-sm text-center">BOXES / PLT</th><th className="p-2 border-b-2 border-gray-300 text-sm text-center">QTY/BOX</th><th className="p-2 border-b-2 border-gray-300 text-sm text-right">TOTAL PCS</th></tr></thead>
              <tbody>{(printTargetPallet.items || []).map(i => {
                const isLoom = i.boxes === 0 && LOOM_SIZES.includes(String(i.qtyPerBox));
                const bxs = isLoom ? 1 : i.boxes;
                return (<tr key={i.id}><td className="p-2 border-b border-gray-200">{i.lineNo}</td><td className="p-2 border-b border-gray-200">{i.itemNumber}</td><td className="p-2 border-b border-gray-200 text-center">{bxs}</td><td className="p-2 border-b border-gray-200 text-center">{(Number(i.qtyPerBox)||0).toLocaleString()}</td><td className="p-2 border-b border-gray-200 text-right">{(bxs * (Number(i.qtyPerBox)||0)).toLocaleString()}</td></tr>)
              })}</tbody>
            </table>
            {!isLoomPallet(printTargetPallet) && <h3 className="text-right mt-6 font-bold">Total Boxes on Pallet: {printTargetPallet.boxes}</h3>}
          </div>
        )}
        {printMode === 'packing_list' && (
          <div className="p-10 font-sans mx-auto max-w-[8.5in]">
            <h1 className="text-center text-3xl font-bold mb-8 text-[#2c3e50]">Packing List</h1>
            <div className="mb-8 text-sm"><p><b>Order #:</b> {editingOrder?.id} | <b>PO:</b> {editingOrder?.po} | <b>Ship Date:</b> {editingOrder?.shipmentDate}</p><p><b>Total Boxes for Order:</b> {totals.boxes}</p></div>
            <table className="w-full text-left border-collapse text-sm">
              <thead><tr className="bg-gray-100 uppercase text-xs text-gray-600"><th className="p-3 border-b border-gray-300">Line</th><th className="p-3 border-b border-gray-300">Pallet ID</th><th className="p-3 border-b border-gray-300">Item #</th><th className="p-3 border-b border-gray-300 text-center">Boxes / Plts</th><th className="p-3 border-b border-gray-300 text-center">Qty/Box</th><th className="p-3 border-b border-gray-300 text-right">Total Pcs</th></tr></thead>
              <tbody>{(() => {
                const allFlat = editingOrder?.palletList?.flatMap(p => (p.items || []).map(i => ({...i, palletId: p.number}))) || [];
                const grouped = allFlat.reduce((acc, item) => { if(!acc[item.lineNo]) acc[item.lineNo] = []; acc[item.lineNo].push(item); return acc; }, {} as Record<string, typeof allFlat>);
                const sortedLines = Object.keys(grouped).sort((a,b) => parseInt(a)-parseInt(b));
                return sortedLines.map(line => {
                  const items = grouped[line]; let subBoxes = 0; let subPcs = 0;
                  return (<React.Fragment key={line}>{items.map((it, idx) => { const isLoom = it.boxes === 0 && LOOM_SIZES.includes(String(it.qtyPerBox)); const bxs = isLoom ? 1 : (Number(it.boxes)||0); const pcs = isLoom ? Number(it.qtyPerBox) : bxs * (Number(it.qtyPerBox)||0); subBoxes += bxs; subPcs += pcs; return (<tr key={`${line}-${it.id}-${idx}`} className="border-b border-gray-100"><td className="p-3">{it.lineNo}</td><td className="p-3">Pallet {it.palletId}</td><td className="p-3">{it.itemNumber}</td><td className="p-3 text-center">{bxs}</td><td className="p-3 text-center">{(Number(it.qtyPerBox)||0).toLocaleString()}</td><td className="p-3 text-right">{pcs.toLocaleString()}</td></tr>) })}<tr className="bg-gray-50 border-b-2 border-gray-300 font-bold text-gray-800"><td colSpan={3} className="p-3 text-right">Subtotal Line {line}:</td><td className="p-3 text-center">{subBoxes}</td><td className="p-3 text-center">-</td><td className="p-3 text-right">{subPcs.toLocaleString()}</td></tr></React.Fragment>);
                })
              })()}</tbody>
            </table>
          </div>
        )}
        {printMode === 'weight_sheet' && (
          <div className="p-10 font-sans mx-auto max-w-[8.5in]">
            <h1 className="text-center text-3xl font-bold mb-8">Weight Sheet</h1>
            <div className="mb-8 text-sm"><p><b>Order #:</b> {editingOrder?.id} | <b>PO:</b> {editingOrder?.po}</p><p><b>Ship Date:</b> {editingOrder?.shipmentDate}</p><p><b>Total Boxes:</b> {totals.boxes}</p></div>
            <table className="w-full text-left border-collapse text-sm">
              <thead><tr className="bg-gray-100 uppercase text-xs text-gray-600"><th className="p-4 border-b border-gray-300">Pallet ID</th><th className="p-4 border-b border-gray-300 text-center">Total Boxes on Pallet</th><th className="p-4 border-b border-gray-300 text-right">Weight (lbs)</th></tr></thead>
              <tbody>{editingOrder?.palletList?.map(p => { const displayWeight = p.weight && p.weight !== "0.00" && p.weight !== "0" ? p.weight : ""; return (<tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50"><td className="p-3 py-4 text-gray-800 font-medium">Pallet {p.number} {isLoomPallet(p) ? '(Loom)' : ''}</td><td className="p-3 py-4 text-center text-gray-800">{p.boxes}</td><td className="p-3 py-4 text-right"><div className="inline-block min-w-[100px] h-8 border-b border-gray-400">{displayWeight}</div></td></tr>) })}</tbody>
            </table>
          </div>
        )}
        {printMode === 'truck_report' && (
          <div className="p-10 font-sans mx-auto max-w-[11in] sheet-page">
            <h1 className="text-center text-3xl font-bold mb-6 text-[#2c3e50]">Shipping Report</h1>
            <h2 className="text-center text-xl font-bold mb-10">Date: {reportDate}</h2>
            {truckReportSummary.trucks.map(t => (
              <div key={t.id} className="mb-8">
                <h3 className="text-lg font-bold mb-2">Truck: {t.id}</h3>
                <table className="w-full text-sm text-left border-collapse mb-2">
                  <thead className="bg-gray-100 uppercase text-[10px] text-gray-600"><tr><th className="p-2 border-b border-gray-300">ORDER #</th><th className="p-2 border-b border-gray-300">PO #</th><th className="p-2 border-b border-gray-300">FREIGHT</th><th className="p-2 border-b border-gray-300 text-center">LOOM PLTS</th><th className="p-2 border-b border-gray-300 text-center">NORMAL PLTS</th><th className="p-2 border-b border-gray-300 text-center">TOTAL BOXES</th><th className="p-2 border-b border-gray-300 text-right">WEIGHT (LBS)</th></tr></thead>
                  <tbody>{t.ordersData.map(o => (<tr key={o.id} className="border-b border-gray-100"><td className="p-3">{o.id}</td><td className="p-3">{o.po}</td><td className="p-3">{o.freight}</td><td className="p-3 text-center font-bold text-purple-600">{o.loomPlts}</td><td className="p-3 text-center">{o.normalPlts}</td><td className="p-3 text-center">{o.finalBoxes}</td><td className="p-3 text-right">{Number(o.finalWeight||0).toFixed(2)}</td></tr>))}<tr className="bg-gray-50 font-bold text-gray-800"><td colSpan={3} className="p-3 text-right">Totals for {t.id}:</td><td className="p-3 text-center text-purple-700">{t.tLoom}</td><td className="p-3 text-center">{t.tNormal}</td><td className="p-3 text-center">{t.tBoxes}</td><td className="p-3 text-right">{Number(t.tWeight||0).toFixed(2)}</td></tr></tbody>
                </table>
              </div>
            ))}
            <h3 className="text-xl font-bold mt-12 mb-4">Grand Totals for {reportDate}</h3>
            <table className="w-full text-left border-collapse border border-gray-300">
               <thead><tr className="bg-gray-100"><th className="p-4 border-r border-gray-300">Total Trucks/Methods:</th><th className="p-4 border-r border-gray-300 text-purple-700">Total Loom Pallets:</th><th className="p-4 border-r border-gray-300 text-blue-700">Total Normal Pallets:</th><th className="p-4 border-r border-gray-300 text-orange-700">Total Boxes:</th><th className="p-4 text-green-700">Total Weight:</th></tr></thead>
               <tbody><tr><td className="p-4 text-xl font-bold border-r border-gray-300">{truckReportSummary.grandTrucks}</td><td className="p-4 text-xl font-bold border-r border-gray-300">{truckReportSummary.grandLoomPlts}</td><td className="p-4 text-xl font-bold border-r border-gray-300">{truckReportSummary.grandNormalPlts}</td><td className="p-4 text-xl font-bold border-r border-gray-300">{truckReportSummary.grandBoxes.toLocaleString()}</td><td className="p-4 text-xl font-bold">{truckReportSummary.grandWeight.toLocaleString()} lbs</td></tr></tbody>
            </table>
          </div>
        )}
        <style>{`@media print { .print\\:hidden { display: none !important; } @page { margin: 0.5in; } .label-page { page-break-after: always; width: 4in; height: 2in; margin: 0; padding: 0.2in; } .sheet-page { page-break-after: always; margin: 0; padding: 0.5in; width: 100%; } }`}</style>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // RENDER: MAIN APPLICATION
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#fcfdfe] font-sans text-slate-900 selection:bg-indigo-100">
      <header className="bg-white border-b sticky top-0 z-30 px-8 flex justify-between items-center h-16 shadow-sm">
        <div className="flex items-center gap-12 h-full">
          <h1 className="text-xl font-black tracking-tighter text-indigo-600 select-none">Orders</h1>
          <nav className="flex h-full items-center gap-1">
            {[
              { id: "Order Summary", icon: <List className="w-4 h-4"/>, label: "Order Summary" },
              { id: "Create Order", icon: <Plus className="w-4 h-4"/>, label: "Create Order" },
              { id: "Truck Report", icon: <TruckIcon className="w-4 h-4"/>, label: "Truck Report" }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 h-full text-sm font-semibold flex items-center gap-2 transition-all border-b-2 ${activeTab === tab.id || (activeTab === "Order Details" && tab.id === "Order Summary") ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-500">User: <span className="font-bold text-gray-800">{currentUser}</span></span>
          <button onClick={() => setCurrentUser(null)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all" title="Log out"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-8">
        {activeTab === "Order Summary" && (
          <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-10">
              <div className="w-full max-w-xl">
                <h2 className="text-2xl font-bold text-slate-800 mb-4">Operations Dashboard</h2>
                <div className="relative group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors w-4 h-4" />
                  <input type="text" placeholder="Search Order ID, PO or Items..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-11 pr-4 py-3 bg-white border-2 border-slate-100 rounded-2xl shadow-sm focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all" />
                </div>
              </div>
            </div>

            {delayedOrdersList.length > 0 && (
              <section className="mb-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center shadow-sm border border-red-100"><AlertTriangle className="w-5 h-5"/></div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">Attention Required</h2>
                </div>
                <div className="flex flex-wrap gap-4">{delayedOrdersList.map(o => renderOrderCard(o))}</div>
              </section>
            )}

            <section>
              <h2 className="text-xl font-black text-slate-900 mb-6 tracking-tight">Shipping Schedule</h2>
              <div className="space-y-8">
                {activeDates.map(dg => (
                  <div key={dg.date} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <button onClick={() => toggleDate(dg.date)} className="w-full flex items-center justify-between p-5 bg-slate-50/50 hover:bg-slate-100/50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><Calendar className="w-5 h-5 text-indigo-600"/></div>
                        <span className="text-base font-bold text-slate-700">Scheduled for {dg.date}</span>
                      </div>
                      <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedDates[dg.date] ? 'rotate-180' : ''}`} />
                    </button>
                    {expandedDates[dg.date] && (
                      <div className="p-6 space-y-6">
                        {dg.trucks.map(t => (
                          <div key={t.id} className="space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                              <button onClick={() => toggleTruck(dg.date, t.id)} className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider hover:text-indigo-600 transition-colors">
                                <TruckIcon className="w-4 h-4"/> {t.id}
                                <ChevronDown className={`w-4 h-4 transition-transform ${expandedTrucks[`${dg.date}-${t.id}`] ? 'rotate-180' : ''}`} />
                              </button>
                              <div className="flex gap-4 text-[10px] font-bold text-slate-400">
                                <span>{t.summary.pallets} Plts</span><span>{t.summary.boxes} Bxs</span>
                                <span className="text-indigo-600 font-black">{t.summary.weight} LBS</span>
                              </div>
                            </div>
                            {expandedTrucks[`${dg.date}-${t.id}`] && (<div className="flex flex-wrap gap-4">{t.orders.map(o => renderOrderCard(o))}</div>)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {pastCompletedDates.length > 0 && (
              <section className="mt-12">
                <div className="flex items-center gap-3 mb-6 opacity-60">
                  <Archive className="w-6 h-6 text-slate-500"/>
                  <h2 className="text-xl font-black text-slate-700 tracking-tight">Past Orders (Completed)</h2>
                </div>
                <div className="space-y-8 opacity-75 hover:opacity-100 transition-opacity">
                  {pastCompletedDates.map(dg => (
                    <div key={dg.date} className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm overflow-hidden grayscale hover:grayscale-0 transition-all">
                      <button onClick={() => toggleDate(dg.date)} className="w-full flex items-center justify-between p-5 hover:bg-slate-100/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><CheckCircle2 className="w-5 h-5 text-emerald-600"/></div>
                          <span className="text-base font-bold text-slate-700">Completed on {dg.date}</span>
                        </div>
                        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${expandedDates[dg.date] ? 'rotate-180' : ''}`} />
                      </button>
                      {expandedDates[dg.date] && (
                        <div className="p-6 space-y-6">
                          {dg.trucks.map(t => (
                            <div key={t.id} className="space-y-4">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <button onClick={() => toggleTruck(dg.date, t.id)} className="flex items-center gap-2 text-sm font-bold text-slate-500 uppercase tracking-wider hover:text-indigo-600 transition-colors">
                                  <TruckIcon className="w-4 h-4"/> {t.id}
                                  <ChevronDown className={`w-4 h-4 transition-transform ${expandedTrucks[`${dg.date}-${t.id}`] ? 'rotate-180' : ''}`} />
                                </button>
                                <div className="flex gap-4 text-[10px] font-bold text-slate-400">
                                  <span>{t.summary.pallets} Plts</span><span>{t.summary.boxes} Bxs</span>
                                  <span className="text-emerald-600 font-black">{t.summary.weight} LBS</span>
                                </div>
                              </div>
                              {expandedTrucks[`${dg.date}-${t.id}`] && (<div className="flex flex-wrap gap-4">{t.orders.map(o => renderOrderCard(o))}</div>)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === "Create Order" && (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm animate-in fade-in">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 rounded-t-lg">
              <h2 className="text-2xl font-bold text-gray-800">Create New Order</h2>
              <button onClick={() => setActiveTab("Order Summary")} className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"><ArrowLeft className="w-4 h-4"/> Back to Dashboard</button>
            </div>
            <form onSubmit={handleCreateOrder} className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Order ID <span className="text-red-500">*</span></label><input required value={newOrderForm.id} onChange={e => setNewOrderForm({...newOrderForm, id: e.target.value})} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2.5 text-sm focus:ring-blue-500 outline-none" placeholder="e.g., ORD12345" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">PO Reference</label><input value={newOrderForm.po} onChange={e => setNewOrderForm({...newOrderForm, po: e.target.value})} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2.5 text-sm focus:ring-blue-500 outline-none" placeholder="e.g., PO67890"/></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Ship Date <span className="text-red-500">*</span></label><input type="date" required value={formatForInput(newOrderForm.shipmentDate)} onChange={e => setNewOrderForm({...newOrderForm, shipmentDate: formatFromInput(e.target.value)})} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2.5 text-sm focus:ring-blue-500 outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-2">Freight Terms</label><select value={newOrderForm.freight} onChange={e => setNewOrderForm({...newOrderForm, freight: e.target.value})} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2.5 text-sm outline-none appearance-none"><option value="Select Freight Terms">Select Freight Terms</option><option value="Collect">Collect</option><option value="PPD and Charge">PPD and Charge</option><option value="CPT">CPT</option><option value="Prepaid">Prepaid</option></select></div>
                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Truck Assignment</label><select value={newOrderForm.truckId} onChange={e => setNewOrderForm({...newOrderForm, truckId: e.target.value})} className="w-full max-w-md bg-[#f4f6f8] border border-gray-200 rounded-md p-2.5 text-sm outline-none appearance-none"><option value="N/A">N/A</option><option value="Truck 1">Truck 1</option><option value="Truck 2">Truck 2</option><option value="Truck 3">Truck 3</option><option value="Truck 4">Truck 4</option><option value="Truck 5">Truck 5</option><option value="Truck 6">Truck 6</option><option value="House Account">House Account</option></select></div>
                <div className="md:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-2">Notes</label><textarea rows={3} value={newOrderForm.notes} onChange={e => setNewOrderForm({...newOrderForm, notes: e.target.value})} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-3 text-sm outline-none resize-none" placeholder="Optional notes for the order" /></div>
              </div>
              <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                <button type="button" onClick={() => setActiveTab("Order Summary")} className="px-5 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-[#1e6acb] text-white rounded-md text-sm font-bold hover:bg-blue-700 flex items-center gap-2"><Plus className="w-4 h-4"/> Create Order</button>
              </div>
            </form>
          </div>
        )}

        {activeTab === "Truck Report" && (
           <div className="bg-white rounded-lg border border-gray-200 shadow-sm animate-in fade-in p-8">
              <h2 className="text-2xl font-bold mb-6 text-gray-800">Truck Report</h2>
              <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-md border border-gray-200 mb-8">
                 <div><label className="block text-xs font-bold text-gray-500 mb-1">Report Date</label><input type="date" value={formatForInput(reportDate)} onChange={e => setReportDate(formatFromInput(e.target.value))} className="border border-gray-300 rounded p-2 text-sm outline-none" /></div>
                 <button onClick={() => triggerPrint('truck_report')} className="mt-4 px-4 py-2 bg-[#1e6acb] text-white font-bold text-sm rounded shadow-sm flex items-center gap-2 hover:bg-blue-700"><Printer className="w-4 h-4"/> Print Report</button>
              </div>
              {reportDateData ? (
                 <div className="space-y-6">
                    {truckReportSummary.trucks.map(t => (
                       <div key={t.id} className="border border-gray-200 rounded-md overflow-hidden">
                          <h3 className="bg-white text-blue-700 font-bold p-3 border-b flex items-center gap-2"><TruckIcon className="w-5 h-5"/> Truck: {t.id}</h3>
                          <table className="w-full text-sm text-left">
                             <thead className="bg-gray-50 text-gray-500 text-xs border-b"><tr><th className="p-3">Order #</th><th className="p-3">PO #</th><th className="p-3">Freight</th><th className="p-3 text-center">Loom Plts</th><th className="p-3 text-center">Normal Plts</th><th className="p-3 text-center">Total Boxes</th><th className="p-3 text-right">Weight (lbs)</th></tr></thead>
                             <tbody>{t.ordersData.map(o => (<tr key={o.id} className="border-b border-gray-100"><td className="p-3">{o.id}</td><td className="p-3">{o.po}</td><td className="p-3">{o.freight}</td><td className="p-3 text-center font-bold text-purple-600">{o.loomPlts}</td><td className="p-3 text-center">{o.normalPlts}</td><td className="p-3 text-center">{o.finalBoxes}</td><td className="p-3 text-right">{Number(o.finalWeight||0).toFixed(2)}</td></tr>))}<tr className="bg-gray-50 font-bold text-gray-800"><td colSpan={3} className="p-3 text-right">Totals for {t.id}:</td><td className="p-3 text-center text-purple-700">{t.tLoom}</td><td className="p-3 text-center">{t.tNormal}</td><td className="p-3 text-center">{t.tBoxes}</td><td className="p-3 text-right">{Number(t.tWeight||0).toFixed(2)}</td></tr></tbody>
                          </table>
                       </div>
                    ))}
                    <div className="border border-gray-200 rounded-md p-6 mt-10">
                       <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Calendar className="w-5 h-5"/> Totals for {reportDate}</h3>
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div className="bg-gray-50 p-4 rounded text-center border border-gray-100"><p className="text-xs font-bold text-gray-500 uppercase">Total Trucks</p><p className="text-2xl font-bold">{truckReportSummary.grandTrucks}</p></div>
                          <div className="bg-purple-50 p-4 rounded text-center border border-purple-200"><p className="text-xs font-bold text-purple-600 uppercase">Loom Pallets</p><p className="text-2xl font-bold text-purple-700">{truckReportSummary.grandLoomPlts}</p></div>
                          <div className="bg-blue-50 p-4 rounded text-center border border-blue-200"><p className="text-xs font-bold text-blue-500 uppercase">Normal Pallets</p><p className="text-2xl font-bold text-blue-700">{truckReportSummary.grandNormalPlts}</p></div>
                          <div className="bg-gray-50 p-4 rounded text-center border border-gray-100"><p className="text-xs font-bold text-gray-500 uppercase">Total Boxes</p><p className="text-2xl font-bold">{truckReportSummary.grandBoxes.toLocaleString()}</p></div>
                       </div>
                       <div className="bg-green-50 p-4 rounded border border-green-200 w-full sm:w-1/4 min-w-[200px] text-center"><p className="text-xs font-bold text-green-600 uppercase">Total Weight</p><p className="text-2xl font-bold text-green-700">{truckReportSummary.grandWeight.toLocaleString()} lbs</p></div>
                    </div>
                 </div>
              ) : (<div className="text-center py-20 text-gray-500">No scheduling data for the selected date.</div>)}
           </div>
        )}

        {activeTab === "Order Details" && editingOrder && (
          <div className="animate-in fade-in duration-300">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => setActiveTab("Order Summary")} className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"><ArrowLeft className="w-4 h-4"/> Back to Dashboard</button>
              <div className="flex gap-2 flex-wrap justify-end">
                <button onClick={() => setDetailsTab('general')} className={`px-4 py-1.5 rounded text-sm font-bold border flex items-center gap-2 ${detailsTab==='general' ? 'bg-[#f4f6f8] text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}><Info className="w-4 h-4"/> Order Details</button>
                <button onClick={() => setDetailsTab('packing_list')} className={`px-4 py-1.5 rounded text-sm font-bold border flex items-center gap-2 ${detailsTab==='packing_list' ? 'bg-[#f4f6f8] text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}><FileText className="w-4 h-4"/> Packing List</button>
                <button onClick={() => setDetailsTab('weight_sheet')} className={`px-4 py-1.5 rounded text-sm font-bold border flex items-center gap-2 ${detailsTab==='weight_sheet' ? 'bg-[#f4f6f8] text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}><Package className="w-4 h-4"/> Weight Sheet</button>
                <button onClick={() => setDetailsTab('items')} className={`px-4 py-1.5 rounded text-sm font-bold border flex items-center gap-2 ${detailsTab==='items' ? 'bg-[#f4f6f8] text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}><List className="w-4 h-4"/> Items</button>
                <button onClick={() => setDetailsTab('order_check')} className={`px-4 py-1.5 rounded text-sm font-bold border flex items-center gap-2 ${detailsTab==='order_check' ? 'bg-[#f4f6f8] text-gray-800 border-gray-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}><CheckSquare className="w-4 h-4"/> Order Check</button>
              </div>
            </div>

            {detailsTab === 'general' && (
              <>
                <div className="bg-white border border-gray-200 shadow-sm mb-6 rounded-md">
                  <div className="p-5 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-[#1e6acb]">Order Details</h2>
                    <span className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded border border-green-100 flex items-center gap-2"><CheckCircle2 className="w-4 h-4"/> Auto-Save Active</span>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mb-5">
                      <div><label className="block text-sm font-bold text-gray-700 mb-1.5">Order Number <span className="text-red-500">*</span></label><input value={editingOrder.id} onChange={e => handleInputChange('id', e.target.value)} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2.5 text-sm outline-none focus:border-blue-500 font-bold" /></div>
                      <div><label className="block text-sm font-bold text-gray-700 mb-1.5">PO (Purchase Order)</label><input value={editingOrder.po} onChange={e => handleInputChange('po', e.target.value)} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2.5 text-sm outline-none focus:border-blue-500 font-bold" /></div>
                    </div>
                    <div className="flex gap-16 mb-5 border-b border-gray-100 pb-5">
                      <div className="flex items-center gap-2 text-sm font-bold"><span className="text-gray-800">Total Pallets:</span><span className="bg-gray-200 px-3 py-1 rounded-md text-gray-800 text-base">{totals.pallets} <span className="text-xs text-gray-500 font-medium">({totals.normalPallets} Plts, {totals.loomPallets} Looms)</span></span></div>
                      <div className="flex items-center gap-2 text-sm font-bold"><span className="text-gray-800">Total Boxes (Order):</span><span className="bg-gray-200 px-3 py-1 rounded-md text-gray-800 text-base">{totals.boxes}</span></div>
                      <div className="flex items-center gap-2 text-sm font-bold"><span className="text-gray-800">Total Weight (Order):</span><span className="bg-gray-200 px-3 py-1 rounded-md text-gray-800 text-base">{totals.weight.toFixed(2)} lbs</span></div>
                    </div>
                    <div className="mb-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Shipment Date</label><input type="date" value={formatForInput(editingOrder.shipmentDate || "")} onChange={e => handleInputChange('shipmentDate', formatFromInput(e.target.value))} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2 text-sm outline-none focus:border-blue-500" /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Freight Terms</label><select value={editingOrder.freight} onChange={e => handleInputChange('freight', e.target.value)} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2 text-sm outline-none appearance-none"><option value="Collect">Collect</option><option value="PPD and Charge">PPD and Charge</option><option value="CPT">CPT</option><option value="Prepaid">Prepaid</option></select></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Truck Assignment / Shipping Method</label><select value={editingOrder.truckId} onChange={e => handleInputChange('truckId', e.target.value)} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2 text-sm outline-none appearance-none font-bold text-indigo-600"><option value="Unassigned">Unassigned</option><option value="Truck 1">Truck 1</option><option value="Truck 2">Truck 2</option><option value="Truck 3">Truck 3</option><option value="Truck 4">Truck 4</option><option value="Truck 5">Truck 5</option><option value="Truck 6">Truck 6</option><option value="House Account">House Account</option></select><p className="text-xs text-gray-400 mt-1 italic">Change this to move the order to a different section on the Dashboard.</p></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-5">
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Order Status</label><select value={editingOrder.status} onChange={e => handleInputChange('status', e.target.value)} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2 text-sm outline-none appearance-none"><option value="Completed">Completed</option><option value="In Progress">In Progress</option><option value="Delayed">Delayed</option></select></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1.5">Number of Loose Boxes Shipped</label><input type="number" value={editingOrder.looseBoxes || 0} onChange={e => handleInputChange('looseBoxes', Number(e.target.value))} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-2 text-sm outline-none focus:border-blue-500" /></div>
                    </div>
                    <div className="mb-6"><label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label><textarea rows={3} value={editingOrder.notes || ""} onChange={e => handleInputChange('notes', e.target.value)} className="w-full bg-[#f4f6f8] border border-gray-200 rounded-md p-3 text-sm outline-none focus:border-blue-500 resize-none" /></div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-between items-end mb-4 px-1">
                    <h3 className="text-2xl font-bold text-gray-800">Pallets</h3>
                    <div className="flex gap-2">
                      <button onClick={() => triggerPrint('pallet_sheets_all')} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"><Printer className="w-4 h-4"/> Print All Sheets</button>
                      <button onClick={() => triggerPrint('labels_all')} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 shadow-sm"><Printer className="w-4 h-4"/> Print All Labels</button>
                      <button onClick={() => setIsBulkModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 shadow-sm"><Database className="w-4 h-4"/> Add Bulk</button>
                      <button onClick={handleAddPallet} className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1e6acb] text-white rounded text-sm font-bold hover:bg-blue-700 shadow-sm"><Plus className="w-4 h-4"/> Add Pallet</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {editingOrder.palletList?.map(pallet => {
                      const isLoom = isLoomPallet(pallet);
                      return (
                      <div key={pallet.id} className={`bg-white border ${isLoom ? 'border-purple-300' : 'border-gray-300'} rounded-md shadow-sm overflow-hidden`}>
                        <div className={`p-4 flex justify-between items-center transition-colors ${isLoom ? 'bg-purple-50 hover:bg-purple-100' : 'bg-white hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-6">
                            <span className={`font-bold text-[15px] ${isLoom ? 'text-purple-700' : 'text-[#1e6acb]'}`}>Pallet {pallet.number} {isLoom && <span className="text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded ml-2">LOOM</span>}</span>
                            <div className="flex gap-4 text-sm text-gray-600">
                              <span>Boxes: <span className="font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">{pallet.boxes}</span></span>
                              <span>Weight: <span className="font-bold text-gray-800 bg-gray-100 px-1.5 py-0.5 rounded">{pallet.weight} lbs</span></span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-gray-500">
                            <button onClick={() => setExpandedPallets(p => ({...p, [pallet.id]: !p[pallet.id]}))}><ChevronDown className={`w-4 h-4 transition-transform ${expandedPallets[pallet.id] ? 'rotate-180 text-blue-600' : ''}`}/></button>
                            <button onClick={() => printPalletSheet(pallet)} title="Print Pallet Sheet"><FileText className="w-4 h-4 hover:text-gray-800"/></button>
                            <button onClick={() => printLabel(pallet)} title="Print Label"><Tag className="w-4 h-4 hover:text-gray-800"/></button>
                            <div className="relative">
                              <button onClick={() => setMovingPalletId(movingPalletId === pallet.id ? null : pallet.id)} title="Change Order"><ArrowRightLeft className="w-4 h-4 hover:text-gray-800"/></button>
                              {movingPalletId === pallet.id && (
                                <div className="absolute right-0 mt-2 bg-white border shadow-xl rounded p-2 z-10 w-48 flex gap-2">
                                  <input type="number" min="1" max={editingOrder.palletList?.length} value={targetPosition} onChange={e => setTargetPosition(parseInt(e.target.value))} className="w-full border rounded p-1 text-sm"/>
                                  <button onClick={executeMovePallet} className="bg-[#1e6acb] text-white px-2 py-1 rounded text-xs font-bold">Move</button>
                                </div>
                              )}
                            </div>
                            <button onClick={() => setEditingPalletId(pallet.id)}><Pencil className="w-4 h-4 hover:text-gray-800"/></button>
                            <button onClick={() => setConfirmDialog({isOpen:true, title:"Delete Pallet", message:"Are you sure you want to delete this pallet?", onConfirm: () => executeDeletePallet(pallet.id)})} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        </div>
                        {expandedPallets[pallet.id] && (
                          <div className="p-4 border-t border-gray-300 bg-white">
                            <table className="w-full text-[13px] text-left border border-gray-200">
                              <thead className="bg-white border-b border-gray-200 text-gray-500 font-medium"><tr><th className="px-4 py-3 font-medium">Line</th><th className="px-4 py-3 font-medium">Item #</th><th className="px-4 py-3 font-medium text-center">Boxes</th><th className="px-4 py-3 font-medium text-center">Qty/Box</th><th className="px-4 py-3 font-medium text-right">Total Pcs</th><th className="px-4 py-3 font-medium text-right">Added By</th></tr></thead>
                              <tbody className="divide-y divide-gray-100">
                                {pallet.items.map((item) => (
                                  <tr key={item.id} className="bg-white">
                                    <td className="px-4 py-3 text-gray-700 font-bold">{item.lineNo}</td><td className="px-4 py-3 text-gray-700">{item.itemNumber}</td>
                                    <td className="px-4 py-3 text-center text-gray-700">{item.boxes}</td><td className="px-4 py-3 text-center text-gray-700">{(Number(item.qtyPerBox)||0).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-gray-700 font-bold">{((Number(item.boxes)||0) * (Number(item.qtyPerBox)||0)).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right text-gray-500 text-[11px] uppercase tracking-wider">{item.addedBy || 'N/A'}</td>
                                  </tr>
                                ))}
                                {pallet.items.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-500">No items on this pallet</td></tr>}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                </div>
              </>
            )}

            {detailsTab === 'packing_list' && (
               <div className="bg-white border border-gray-200 rounded-md p-10 shadow-sm animate-in fade-in">
                  <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                     <div><h2 className="text-2xl font-bold text-[#1e6acb] mb-2">Packing List</h2><p className="text-sm text-gray-600">Order: {editingOrder.id} | PO: {editingOrder.po} | Total Boxes: {totals.boxes}</p></div>
                     <button onClick={() => triggerPrint('packing_list')} className="px-4 py-2 bg-[#1e6acb] text-white rounded-md font-bold flex gap-2"><Printer className="w-4 h-4"/> Print List</button>
                  </div>
                  <table className="w-full text-sm text-left border border-gray-200">
                    <thead className="bg-gray-100 text-gray-600"><tr><th className="p-3 border-b border-gray-300">Line</th><th className="p-3 border-b border-gray-300">Pallet ID</th><th className="p-3 border-b border-gray-300">Item #</th><th className="p-3 border-b border-gray-300 text-center">Boxes/Plts</th><th className="p-3 border-b border-gray-300 text-center">Qty/Box</th><th className="p-3 border-b border-gray-300 text-right">Total Pcs</th></tr></thead>
                    <tbody>{(() => {
                      const allFlat = editingOrder?.palletList?.flatMap(p => (p.items || []).map(i => ({...i, palletId: p.number}))) || [];
                      const grouped = allFlat.reduce((acc, item) => { if(!acc[item.lineNo]) acc[item.lineNo] = []; acc[item.lineNo].push(item); return acc; }, {} as Record<string, typeof allFlat>);
                      const sortedLines = Object.keys(grouped).sort((a,b) => parseInt(a)-parseInt(b));
                      return sortedLines.map(line => {
                        const items = grouped[line]; let subBoxes = 0; let subPcs = 0;
                        return (<React.Fragment key={line}>{items.map((it, idx) => { const isLoom = it.boxes === 0 && LOOM_SIZES.includes(String(it.qtyPerBox)); const bxs = isLoom ? 1 : (Number(it.boxes)||0); const pcs = isLoom ? Number(it.qtyPerBox) : bxs * (Number(it.qtyPerBox)||0); subBoxes += bxs; subPcs += pcs; return (<tr key={`${line}-${it.id}-${idx}`} className="border-b border-gray-100"><td className="p-3">{it.lineNo}</td><td className="p-3">Pallet {it.palletId}</td><td className="p-3">{it.itemNumber}</td><td className="p-3 text-center">{bxs}</td><td className="p-3 text-center">{(Number(it.qtyPerBox)||0).toLocaleString()}</td><td className="p-3 text-right">{pcs.toLocaleString()}</td></tr>) })}<tr className="bg-gray-50 border-b-2 border-gray-300 font-bold text-gray-800"><td colSpan={3} className="p-3 text-right">Subtotal Line {line}:</td><td className="p-3 text-center">{subBoxes}</td><td className="p-3 text-center">-</td><td className="p-3 text-right">{subPcs.toLocaleString()}</td></tr></React.Fragment>);
                      })
                    })()}</tbody>
                  </table>
               </div>
            )}

            {detailsTab === 'weight_sheet' && (
               <div className="bg-white border border-gray-200 rounded-md p-10 shadow-sm animate-in fade-in">
                  <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
                     <div><h2 className="text-2xl font-bold text-[#1e6acb] mb-2">Weight Sheet</h2><div className="text-sm text-gray-600 font-medium"><p>Order #: {editingOrder.id}</p><p>PO: {editingOrder.po}</p><p>Ship Date: {editingOrder.shipmentDate}</p><p>Total Boxes: {totals.boxes}</p></div></div>
                     <button onClick={() => triggerPrint('weight_sheet')} className="px-4 py-2 border border-gray-300 bg-gray-50 text-gray-800 rounded font-bold flex gap-2 hover:bg-gray-100"><Printer className="w-4 h-4"/> Print Sheet</button>
                  </div>
                  <table className="w-full text-sm text-left border border-gray-200">
                    <thead className="bg-gray-100 text-gray-600"><tr><th className="p-4 border-b border-gray-300">Pallet ID</th><th className="p-4 border-b border-gray-300 text-center">Total Boxes in Pallet</th><th className="p-4 border-b border-gray-300 text-right">Weight (lbs)</th></tr></thead>
                    <tbody>{editingOrder.palletList?.map(p => { const displayWeight = p.weight && p.weight !== "0.00" && p.weight !== "0" ? p.weight : ""; return (<tr key={p.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors"><td className="p-3 py-4 text-gray-800 font-medium">Pallet {p.number} {isLoomPallet(p) ? '(Loom)' : ''}</td><td className="p-3 py-4 text-center text-gray-800">{p.boxes}</td><td className="p-3 py-4 text-right"><input value={displayWeight} onChange={e => setEditingOrder({...editingOrder, palletList: editingOrder.palletList?.map(px => px.id === p.id ? {...px, weight: e.target.value} : px)})} className="w-24 border border-gray-300 rounded p-1.5 text-right bg-gray-50 outline-none focus:bg-white focus:border-blue-500 shadow-sm" placeholder="Enter Weight" /></td></tr>) })}</tbody>
                  </table>
               </div>
            )}

            {detailsTab === 'items' && (
               <div className="bg-white border border-gray-200 rounded-md p-8 shadow-sm animate-in fade-in max-w-3xl">
                  <h2 className="text-xl font-bold text-gray-800 mb-6">Item Verification (Order {editingOrder.id})</h2>
                  <div className="flex gap-4 mb-8 bg-gray-50 p-4 rounded border border-gray-200">
                     <input value={newItemNumberForm} onChange={e => setNewItemNumberForm(e.target.value)} onKeyDown={e => { if(e.key === 'Enter') handleAddMasterItem() }} placeholder="Press Enter or Add to List" className="flex-1 border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500" autoFocus />
                     <button onClick={handleAddMasterItem} className="bg-white border border-gray-300 px-4 py-2 rounded text-sm font-bold flex items-center gap-2 hover:bg-gray-50"><Plus className="w-4 h-4"/> Add to List</button>
                  </div>
                  <h3 className="text-sm font-bold text-gray-500 mb-2">Defined Lines:</h3>
                  <table className="w-full text-sm text-left border border-gray-200">
                    <thead className="bg-gray-100 text-gray-600"><tr><th className="p-3 border-b border-gray-300 w-20">LINE</th><th className="p-3 border-b border-gray-300">ITEM NUMBER</th><th className="p-3 border-b border-gray-300 w-10"></th></tr></thead>
                    <tbody>{editingOrder.masterItems?.map(m => (<tr key={m.id} className="border-b border-gray-200 bg-white"><td className="p-3 font-bold text-gray-700">{m.lineNo}</td><td className="p-3">{m.itemNumber}</td><td className="p-3 text-right"><button onClick={() => handleDeleteMasterItem(m.id)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button></td></tr>))}{(!editingOrder.masterItems || editingOrder.masterItems.length === 0) && <tr><td colSpan={3} className="p-4 text-center text-gray-400">No items defined yet.</td></tr>}</tbody>
                  </table>
               </div>
            )}

            {detailsTab === 'order_check' && (
               <div className="bg-white border border-gray-200 rounded-md p-8 shadow-sm animate-in fade-in">
                  <div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold text-[#1e6acb]">Order Review & Validation</h2></div>
                  <p className="text-sm text-gray-500 mb-6 flex items-center gap-2 bg-blue-50 p-3 rounded text-blue-800 border border-blue-100"><Info className="w-4 h-4"/>Enter the required boxes and quantities from the order paper. The system compares in real time with what has been scanned.</p>
                  <table className="w-full text-sm text-left border border-gray-200">
                    <thead className="bg-gray-100 text-gray-600"><tr><th className="p-3 border-b border-gray-300" rowSpan={2}>Line</th><th className="p-3 border-b border-gray-300" rowSpan={2}>Item Number</th><th className="p-3 border-b border-gray-300 text-center" colSpan={2}>Required (Paper)</th><th className="p-3 border-b border-gray-300 text-center" colSpan={2}>Packed (System)</th><th className="p-3 border-b border-gray-300" rowSpan={2}>Status</th></tr><tr><th className="p-2 border-b border-gray-300 text-center bg-gray-50">Boxes / Plts</th><th className="p-2 border-b border-gray-300 text-center bg-gray-50">Total Pcs</th><th className="p-2 border-b border-gray-300 text-center bg-gray-50">Boxes / Plts</th><th className="p-2 border-b border-gray-300 text-center bg-gray-50">Total Pcs</th></tr></thead>
                    <tbody>
                      {editingOrder.masterItems?.map(m => {
                        const packedQty = getPackedQtyForLine(m.lineNo, editingOrder);
                        const packedBoxes = getPackedBoxesForLine(m.lineNo, editingOrder);
                        const mQty = Number(m.orderedQty) || 0; const mBoxes = Number(m.orderedBoxes) || 0;
                        const diffQty = packedQty - mQty; const diffBoxes = packedBoxes - mBoxes;
                        const isMatch = (mQty > 0 || mBoxes > 0) && diffQty === 0 && diffBoxes === 0;
                        const isMissing = (mQty > 0 || mBoxes > 0) && (diffQty < 0 || diffBoxes < 0);
                        return (
                          <tr key={m.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                            <td className="p-3 font-bold">{m.lineNo}</td><td className="p-3 font-mono">{m.itemNumber}</td>
                            <td className="p-3 text-center"><input type="number" value={m.orderedBoxes || ""} onChange={e => handleUpdateMasterItem(m.id, 'orderedBoxes', Number(e.target.value))} onKeyDown={handleOrderCheckKeyDown} className="order-check-input w-20 border border-gray-300 rounded p-1.5 outline-none text-center focus:border-blue-500 shadow-sm" placeholder="0" /></td>
                            <td className="p-3 text-center"><input type="number" value={m.orderedQty || ""} onChange={e => handleUpdateMasterItem(m.id, 'orderedQty', Number(e.target.value))} onKeyDown={handleOrderCheckKeyDown} className="order-check-input w-24 border border-gray-300 rounded p-1.5 outline-none text-center focus:border-blue-500 shadow-sm" placeholder="0" /></td>
                            <td className="p-3 text-center font-bold text-gray-800">{packedBoxes}</td><td className="p-3 text-center font-bold text-gray-800">{packedQty.toLocaleString()}</td>
                            <td className="p-3">{(mQty === 0 && mBoxes === 0) ? <span className="text-gray-400">Awaiting Input</span> : isMatch ? <span className="text-green-600 font-bold bg-green-50 border border-green-200 px-2 py-1 rounded flex items-center w-max gap-1"><CheckCircle2 className="w-4 h-4"/> Matched</span> : isMissing ? <span className="text-red-600 font-bold bg-red-50 border border-red-200 px-2 py-1 rounded w-max block">Missing</span> : <span className="text-yellow-600 font-bold bg-yellow-50 border border-yellow-200 px-2 py-1 rounded w-max block">Overpacked</span>}</td>
                          </tr>
                        );
                      })}
                      {(!editingOrder.masterItems || editingOrder.masterItems.length === 0) && (<tr><td colSpan={7} className="p-6 text-center text-gray-500">Go to the "Items" tab to define the order lines first.</td></tr>)}
                    </tbody>
                  </table>
               </div>
            )}
          </div>
        )}
      </main>

      {/* PALLET EDIT MODAL */}
      {editingPalletId && editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setEditingPalletId(null)} />
          <div className="relative bg-[#f4f6f8] rounded-md shadow-2xl w-full max-w-[550px] flex flex-col max-h-[90vh]">
            <div className="p-4 flex justify-between items-center border-b border-gray-200 bg-white rounded-t-md">
              <h3 className="text-lg font-bold text-gray-800">Edit Pallet {editingOrder.palletList?.find(p => p.id === editingPalletId)?.number}</h3>
              <button onClick={() => setEditingPalletId(null)} className="text-gray-500 hover:text-gray-800"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <div className="mb-4"><label className="block text-[13px] font-bold text-gray-700 mb-1.5">Pallet Weight (lbs)</label><input value={editingOrder.palletList?.find(p => p.id === editingPalletId)?.weight || ""} onChange={e => setEditingOrder({...editingOrder, palletList: editingOrder.palletList?.map(p => p.id === editingPalletId ? {...p, weight: e.target.value} : p)})} className="w-full bg-white border border-gray-300 rounded p-2 text-[13px] outline-none focus:border-blue-500" /></div>
              <div className="mb-4">
                <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Items on Pallet</label>
                <div className="bg-white border border-gray-300 rounded p-2 max-h-48 overflow-y-auto space-y-2">
                  {editingOrder.palletList?.find(p => p.id === editingPalletId)?.items.map(item => (
                    <div key={item.id} className="flex justify-between items-center border border-gray-200 p-2.5 rounded shadow-sm">
                      <div className="flex flex-col"><span className="text-[13px] text-gray-700 font-bold">L{item.lineNo}: {item.itemNumber}</span><span className="text-[11px] text-gray-500">({item.boxes}b x {item.qtyPerBox}u = {item.boxes * item.qtyPerBox}p) - Added by <span className="font-bold text-blue-600">{item.addedBy || 'N/A'}</span></span></div>
                      <div className="flex gap-2">
                        <button onClick={() => {setLineItemForm({...item}); setEditingLineItemId(item.id);}} className="text-blue-500 hover:text-blue-700"><Pencil className="w-4 h-4"/></button>
                        <button onClick={() => setEditingOrder({...editingOrder, palletList: editingOrder.palletList?.map(p => p.id === editingPalletId ? {...p, items: p.items.filter(i => i.id !== item.id), boxes: p.items.filter(i => i.id !== item.id).reduce((s,i)=>s+(Number(i.boxes)||0),0)} : p)})} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  ))}
                  {editingOrder.palletList?.find(p => p.id === editingPalletId)?.items.length === 0 && <p className="text-[13px] text-gray-400 p-2">No items</p>}
                </div>
              </div>
              <div className="bg-[#eaedf1] border border-gray-300 rounded-md p-4">
                <h4 className="text-[13px] font-bold text-gray-800 mb-3">{editingLineItemId ? "Edit Item" : "Add New Item"}</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div><label className="block text-[12px] font-medium text-gray-700 mb-1">Line No.</label><input value={lineItemForm.lineNo} onChange={e => handleLineNoChange(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-1.5 text-[13px] outline-none focus:border-blue-500" /></div>
                  <div><label className="block text-[12px] font-medium text-gray-700 mb-1">Item Number</label><input value={lineItemForm.itemNumber} onChange={e => setLineItemForm({...lineItemForm, itemNumber: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-1.5 text-[13px] outline-none focus:border-blue-500" placeholder="SKU123" /></div>
                  <div><label className="block text-[12px] font-medium text-gray-700 mb-1">No. of Boxes</label><input type="number" value={lineItemForm.boxes || ""} onChange={e => setLineItemForm({...lineItemForm, boxes: Number(e.target.value)})} className="w-full bg-white border border-gray-300 rounded p-1.5 text-[13px] outline-none focus:border-blue-500" /></div>
                  <div><label className="block text-[12px] font-medium text-gray-700 mb-1">Qty/Box</label><input type="number" value={lineItemForm.qtyPerBox || ""} onChange={e => setLineItemForm({...lineItemForm, qtyPerBox: Number(e.target.value)})} className="w-full bg-white border border-gray-300 rounded p-1.5 text-[13px] outline-none focus:border-blue-500" /></div>
                </div>
                <button onClick={() => handleSaveLineItem()} className="w-full py-2 bg-[#f4f6f8] border border-gray-300 rounded text-[13px] font-bold text-[#1e6acb] hover:bg-white flex justify-center items-center gap-1.5 shadow-sm transition-colors"><Plus className="w-4 h-4"/> {editingLineItemId ? "Update Item" : "Add Item to Pallet"}</button>
              </div>
            </div>
            <div className="p-4 flex justify-end"><button onClick={() => setEditingPalletId(null)} className="px-5 py-2 bg-[#1e6acb] text-white font-bold rounded shadow-sm hover:bg-blue-700 text-sm">Done & Close</button></div>
          </div>
        </div>
      )}

      {/* ADD BULK MODAL */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setIsBulkModalOpen(false)} />
          <div className="relative bg-[#f4f6f8] rounded-md shadow-2xl w-full max-w-sm flex flex-col">
            <div className="p-5 flex justify-between items-center border-b border-gray-200 bg-white rounded-t-md"><h3 className="text-lg font-bold text-gray-800">Add Bulk</h3><button onClick={() => setIsBulkModalOpen(false)} className="text-gray-500"><X className="w-5 h-5"/></button></div>
            <div className="flex border-b border-gray-200 bg-white"><button onClick={() => setBulkTab('looms')} className={`flex-1 py-3 text-sm font-bold ${bulkTab === 'looms' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Looms</button><button onClick={() => setBulkTab('standard')} className={`flex-1 py-3 text-sm font-bold ${bulkTab === 'standard' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>Standard Items</button></div>
            <div className="p-6 space-y-4">
              {bulkTab === 'looms' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Line No. *</label><input type="text" value={bulkForm.lineNo} onChange={e => handleBulkLineNoChange(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500" /></div>
                    <div><label className="block text-sm font-bold text-gray-700 mb-1">Item Number *</label><input type="text" value={bulkForm.itemNo} onChange={e => setBulkForm({...bulkForm, itemNo: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500" /></div>
                  </div>
                  <div><label className="block text-sm font-bold text-gray-700 mb-1">Loom Size *</label><select value={bulkForm.loomSize} onChange={e => setBulkForm({...bulkForm, loomSize: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none"><option value="15000">15000</option><option value="4200">4200</option><option value="25000">25000</option><option value="8500">8500</option></select></div>
                  <div><label className="block text-sm font-bold text-gray-700 mb-1">Number of Pallets *</label><input type="number" value={bulkForm.numPallets} onChange={e => setBulkForm({...bulkForm, numPallets: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500" /></div>
                  <div><label className="block text-sm font-bold text-gray-700 mb-1">Weight per Pallet (lbs) *</label><input type="text" value={bulkForm.weight} onChange={e => setBulkForm({...bulkForm, weight: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500" /></div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">Line No. *</label><input type="text" value={bulkForm.lineNo} onChange={e => handleBulkLineNoChange(e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-xs focus:border-blue-500" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">Item Number *</label><input type="text" value={bulkForm.itemNo} onChange={e => setBulkForm({...bulkForm, itemNo: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-2 text-xs focus:border-blue-500" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">Boxes per Pallet *</label><input type="number" value={bulkForm.boxes} onChange={e => setBulkForm({...bulkForm, boxes: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-2 text-xs focus:border-blue-500" /></div>
                    <div><label className="block text-xs font-bold text-gray-700 mb-1">Qty/Box *</label><input type="number" value={bulkForm.qtyPerBox} onChange={e => setBulkForm({...bulkForm, qtyPerBox: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-2 text-xs focus:border-blue-500" /></div>
                  </div>
                  <div><label className="block text-xs font-bold text-gray-700 mb-1">Total Pallets to Create *</label><input type="number" value={bulkForm.numPallets} onChange={e => setBulkForm({...bulkForm, numPallets: e.target.value})} className="w-full bg-white border border-gray-300 rounded p-2 text-xs focus:border-blue-500" /></div>
                </>
              )}
            </div>
            <div className="p-5 border-t border-gray-200 bg-white rounded-b-md flex justify-end gap-3">
              <button onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded text-sm font-medium bg-[#f4f6f8] hover:bg-gray-200">Cancel</button>
              <button onClick={handleProcessBulkAdd} className="px-4 py-2 bg-[#1e6acb] text-white rounded text-sm font-bold hover:bg-blue-700">Add Pallets</button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK EDIT MODAL */}
      {isQuickEditOpen && editingOrder && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60" onClick={closeAndNavigateSummary} />
            <div className="relative bg-[#f4f6f8] rounded-md w-full max-w-md shadow-2xl flex flex-col">
              <div className="p-5 border-b border-gray-200 bg-white rounded-t-md flex justify-between items-center"><h3 className="text-lg font-bold text-gray-800">Quick Edit: {editingOrder.id}</h3><button onClick={closeAndNavigateSummary} className="text-gray-500 hover:text-gray-800"><X className="w-5 h-5"/></button></div>
              <div className="p-6 space-y-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Shipment Date *</label><input type="date" value={formatForInput(editingOrder.shipmentDate || "")} onChange={e => handleInputChange('shipmentDate', formatFromInput(e.target.value))} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label><textarea rows={3} value={editingOrder.notes || ""} onChange={e => handleInputChange('notes', e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500 resize-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Assign Truck</label><select value={editingOrder.truckId} onChange={e => handleInputChange('truckId', e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none appearance-none font-bold text-indigo-600"><option value="Unassigned">Unassigned</option><option value="Truck 1">Truck 1</option><option value="Truck 2">Truck 2</option><option value="Truck 3">Truck 3</option><option value="Truck 4">Truck 4</option><option value="Truck 5">Truck 5</option><option value="Truck 6">Truck 6</option></select></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Order Status</label><select value={editingOrder.status} onChange={e => handleInputChange('status', e.target.value)} className="w-full bg-white border border-gray-300 rounded p-2 text-sm outline-none appearance-none"><option value="Completed">Completed</option><option value="In Progress">In Progress</option><option value="Delayed">Delayed</option></select></div>
                <div className="border-t border-gray-200 pt-4 mt-2">
                   <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700 mb-3">
                    <div className="relative"><input type="checkbox" className="sr-only" checked={editingOrder.isManualOverride || false} onChange={e => handleInputChange('isManualOverride', e.target.checked)} /><div className={`block w-10 h-5 rounded-full ${editingOrder.isManualOverride ? 'bg-blue-500' : 'bg-gray-300'}`}></div><div className={`dot absolute left-1 top-0.5 bg-white w-4 h-4 rounded-full transition ${editingOrder.isManualOverride ? 'transform translate-x-5' : ''}`}></div></div>
                    Manually Override Values (Estimates)
                  </label>
                  {editingOrder.isManualOverride && (
                    <div className="grid grid-cols-2 gap-3 bg-white p-4 border border-gray-200 rounded">
                       <div><label className="block text-xs font-bold text-gray-600 mb-1">Normal Pallets</label><input type="number" value={editingOrder.normalPallets || editingOrder.pallets} onChange={e => handleInputChange('normalPallets', Number(e.target.value))} className="w-full border rounded p-1.5 text-sm outline-none focus:border-blue-500"/></div>
                       <div><label className="block text-xs font-bold text-gray-600 mb-1">Loom Pallets</label><input type="number" value={editingOrder.loomPallets || 0} onChange={e => handleInputChange('loomPallets', Number(e.target.value))} className="w-full border rounded p-1.5 text-sm outline-none focus:border-blue-500"/></div>
                       <div><label className="block text-xs font-bold text-gray-600 mb-1">Total Boxes</label><input type="number" value={editingOrder.boxes} onChange={e => handleInputChange('boxes', Number(e.target.value))} className="w-full border rounded p-1.5 text-sm outline-none focus:border-blue-500"/></div>
                       <div className="col-span-2"><label className="block text-xs font-bold text-gray-600 mb-1">Weight (lbs)</label><input value={editingOrder.weight} onChange={e => handleInputChange('weight', e.target.value)} className="w-full border rounded p-1.5 text-sm outline-none focus:border-blue-500"/></div>
                    </div>
                  )}
                </div>
              </div>
              <div className="p-4 border-t border-gray-200 bg-white rounded-b-md flex justify-end gap-3"><button onClick={closeAndNavigateSummary} className="px-4 py-2 border border-gray-300 rounded text-sm font-medium hover:bg-gray-50">Close</button></div>
            </div>
         </div>
      )}

      {/* GLOBAL CONFIRM MODAL */}
      {confirmDialog && (
         <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/50" onClick={() => setConfirmDialog(null)} />
            <div className="relative bg-white rounded-md shadow-xl w-full max-w-sm flex flex-col p-6 text-center">
               <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
               <h3 className="text-lg font-bold text-gray-900 mb-2">{confirmDialog.title}</h3>
               <p className="text-sm text-gray-500 mb-6">{confirmDialog.message}</p>
               <div className="flex gap-3 justify-center">
                 <button onClick={() => setConfirmDialog(null)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
                 <button onClick={confirmDialog.onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-bold hover:bg-red-700">Confirm</button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}