"use client"

import { useState, useMemo } from "react"
import { addWithdrawal } from "@/app/actions/finance"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { 
  Search, User, Calendar, Landmark, Wallet, Banknote, 
  FileText, Printer, CheckCircle, TrendingDown, ListChecks, 
  AlertCircle, ShieldCheck, RotateCcw, Eye, ArrowRight
} from "lucide-react"

interface Member { id: string, fullName: string, memberNo: string, phone: string, totalDeposit: number, totalWithdrawal: number }
interface WithdrawalHistory { id: string, receiptNo: string | null, amount: number, date: string, method: string }

export default function WithdrawalClient({ members, history }: { members: Member[], history: WithdrawalHistory[] }) {
  const today = new Date().toISOString().split('T')[0]
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const [formData, setFormData] = useState({
    withdrawalDate: today,
    withdrawalType: "SAVINGS",
    amount: "",
    method: "CASH",
    referenceNo: "",
    preparedBy: "Admin",
    verifiedBy: "",
    approvedBy: "",
  })

  const filteredMembers = useMemo(() => {
    if (!searchQuery) return []
    return members.filter(m => 
      m.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      m.memberNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.phone.includes(searchQuery)
    ).slice(0, 5)
  }, [searchQuery, members])

  // Calculate Available Balance & Remaining
  const availableBalance = selectedMember ? selectedMember.totalDeposit - selectedMember.totalWithdrawal : 0
  const withdrawalAmount = parseFloat(formData.amount) || 0
  const remainingBalance = availableBalance - withdrawalAmount
  const isExceeding = withdrawalAmount > availableBalance

  const handleSelectMember = (member: Member) => {
    setSelectedMember(member)
    setSearchQuery("")
  }

  const handleChange = (name: string, value: string | null | undefined) => {
    setFormData(prev => ({ ...prev, [name]: value ?? "" }))
  }

  const handleSave = () => {
    if (!selectedMember) return toast.error("Validation Error", { description: "Please select a member." })
    if (isExceeding) return toast.error("Insufficient Balance", { description: "Withdrawal amount exceeds available balance." })
    if (withdrawalAmount <= 0) return toast.error("Invalid Amount", { description: "Amount must be greater than zero." })
    setShowConfirm(true)
  }

  const confirmSave = async () => {
    setShowConfirm(false)
    const fd = new FormData()
    fd.append("memberId", selectedMember!.id)
    fd.append("amount", String(withdrawalAmount))
    fd.append("method", formData.method)
    fd.append("date", formData.withdrawalDate)
    fd.append("referenceNo", formData.referenceNo)
    
    try {
      await addWithdrawal(fd)
      toast.success("Withdrawal Processed!", { description: `Voucher generated for ${selectedMember!.fullName}.` })
    } catch (error) {
      toast.error("Save Failed", { description: "Could not process withdrawal." })
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* LEFT & MIDDLE COLUMN: Search, Member Info, Form */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Member Search */}
        <div className="space-y-2">
          <Label htmlFor="memberSearch">Quick Search (Member ID, Name, Mobile)</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              id="memberSearch" 
              placeholder="Type to search member..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-white dark:bg-slate-950 h-11 text-base shadow-sm"
            />
            {filteredMembers.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden">
                {filteredMembers.map(m => (
                  <button 
                    key={m.id} 
                    onClick={() => handleSelectMember(m)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 last:border-0"
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                      {m.fullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-sm text-slate-900 dark:text-white">{m.fullName}</p>
                      <p className="text-xs text-slate-500">{m.memberNo} • {m.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Member Info Card */}
        {selectedMember && (
          <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
            <div className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between bg-gradient-to-r from-slate-50 to-white dark:from-slate-900 dark:to-slate-950">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xl shadow-sm">
                  {selectedMember.fullName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedMember.fullName}</h3>
                  <p className="text-sm font-mono text-slate-500">{selectedMember.memberNo} • {selectedMember.phone}</p>
                  <Badge variant="outline" className="mt-1 bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">ACTIVE</Badge>
                </div>
              </div>
              <div className="flex gap-8 text-right">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-bold">Available Balance</p>
                  <p className="text-2xl font-extrabold text-emerald-600">৳ {availableBalance.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-bold">Total Withdrawn</p>
                  <p className="text-lg font-bold text-rose-600">৳ {selectedMember.totalWithdrawal.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Withdrawal Form */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><Landmark className="h-4 w-4 text-indigo-600" /> Withdrawal Details</h3>
          </div>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            
            <div className="space-y-2">
              <Label htmlFor="voucherNo">Voucher No.</Label>
              <Input id="voucherNo" value="Auto Generated" disabled className="bg-slate-100 dark:bg-slate-800 font-mono text-slate-500" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="withdrawalDate">Transaction Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input id="withdrawalDate" type="date" value={formData.withdrawalDate} onChange={(e) => handleChange("withdrawalDate", e.target.value)} className="pl-9 bg-white dark:bg-slate-950" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Withdrawal Type</Label>
              <Select value={formData.withdrawalType} onValueChange={(v) => handleChange("withdrawalType", String(v))}>
                <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAVINGS">Savings Withdrawal</SelectItem>
                  <SelectItem value="PROFIT">Profit/Dividend Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Withdrawal Amount (৳)</Label>
              <div className="relative">
                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  id="amount" 
                  type="number" 
                  placeholder="0.00" 
                  value={formData.amount} 
                  onChange={(e) => handleChange("amount", e.target.value)} 
                  className={`pl-9 bg-white dark:bg-slate-950 ${isExceeding ? 'border-red-500 focus:border-red-500' : ''}`} 
                />
              </div>
              {isExceeding && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertCircle className="h-3 w-3" /> Exceeds available balance!</p>}
            </div>

            <div className="space-y-2">
              <Label>Transaction Mode</Label>
              <Select value={formData.method} onValueChange={(v) => handleChange("method", v)}>
                <SelectTrigger className="bg-white dark:bg-slate-950"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK">Bank Transfer</SelectItem>
                  <SelectItem value="BKASH">Mobile Banking (bKash)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referenceNo">Cheque / Reference No.</Label>
              <Input id="referenceNo" placeholder="Txn ID / Cheque No" value={formData.referenceNo} onChange={(e) => handleChange("referenceNo", e.target.value)} className="bg-white dark:bg-slate-950" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Input id="remarks" placeholder="Optional remarks..." className="bg-white dark:bg-slate-950" />
            </div>

            {/* Approval Section */}
            <div className="md:col-span-2 mt-4 pt-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="preparedBy">Prepared By</Label>
                <Input id="preparedBy" value={formData.preparedBy} onChange={(e) => handleChange("preparedBy", e.target.value)} className="bg-white dark:bg-slate-950" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verifiedBy">Verified By</Label>
                <Input id="verifiedBy" value={formData.verifiedBy} onChange={(e) => handleChange("verifiedBy", e.target.value)} className="bg-white dark:bg-slate-950" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="approvedBy">Approved By</Label>
                <Input id="approvedBy" value={formData.approvedBy} onChange={(e) => handleChange("approvedBy", e.target.value)} className="bg-white dark:bg-slate-950" />
              </div>
            </div>
            
            <div className="md:col-span-2 flex items-center gap-2 mt-2">
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><ShieldCheck className="h-3 w-3 mr-1" /> Authorization Status: Pending</Badge>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><CheckCircle className="h-3 w-3 mr-1" /> Digital Signature Ready</Badge>
            </div>

          </CardContent>
        </Card>
      </div>

      {/* RIGHT COLUMN: Summary & Actions */}
      <div className="lg:col-span-1 space-y-6">
        
        {/* Live Calculation Summary */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden sticky top-4">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><TrendingDown className="h-4 w-4 text-rose-600" /> Live Summary</h3>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Current Balance:</span>
              <span className="font-bold text-slate-900 dark:text-white">৳ {availableBalance.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Withdrawal Amount:</span>
              <span className="font-bold text-rose-600">- ৳ {withdrawalAmount.toFixed(2)}</span>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <span className="font-bold text-slate-900 dark:text-white">Remaining Balance:</span>
              <span className={`text-xl font-extrabold ${remainingBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>৳ {remainingBalance.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-3">
          <Button onClick={handleSave} className="w-full h-12 text-base bg-rose-600 hover:bg-rose-700 shadow-md" disabled={!selectedMember || isExceeding || withdrawalAmount <= 0}>
            <CheckCircle className="mr-2 h-5 w-5" /> Process Withdrawal
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="h-11 shadow-sm"><Printer className="mr-2 h-4 w-4" /> Save & Print</Button>
            <Button variant="outline" className="h-11 shadow-sm" onClick={() => { setSelectedMember(null); setFormData({ ...formData, amount: "" }) }}><RotateCcw className="mr-2 h-4 w-4" /> Reset</Button>
          </div>
        </div>

        {/* Withdrawal History Table */}
        <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
           <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><ListChecks className="h-4 w-4 text-indigo-600" /> Recent Withdrawals</h3>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 text-[10px] uppercase font-bold text-slate-400">Voucher</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-bold text-slate-400 text-right">Amount</th>
                    <th className="px-4 py-2 text-[10px] uppercase font-bold text-slate-400 text-center">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.length === 0 ? (
                    <tr><td colSpan={3} className="text-center py-8 text-sm text-slate-500">No withdrawals yet.</td></tr>
                  ) : (
                    history.map((h) => (
                      <tr key={h.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50">
                        <td className="px-4 py-2 font-mono text-xs text-indigo-600">{h.receiptNo}</td>
                        <td className="px-4 py-2 text-right font-bold text-rose-600 text-sm">৳ {Number(h.amount).toLocaleString()}</td>
                        <td className="px-4 py-2 text-center text-xs text-slate-500">{new Date(h.date).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="bg-white dark:bg-slate-950 rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="h-6 w-6 text-rose-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Confirm Withdrawal</h3>
              <p className="text-sm text-slate-500 mb-6">
                You are about to process a withdrawal of <span className="font-bold text-rose-600">৳ {withdrawalAmount.toFixed(2)}</span> for <span className="font-bold">{selectedMember?.fullName}</span>.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>Cancel</Button>
                <Button className="flex-1 bg-rose-600 hover:bg-rose-700" onClick={confirmSave}>Confirm Withdrawal</Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}