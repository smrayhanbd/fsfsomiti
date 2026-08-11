"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toggleLoanProductStatus, deleteLoanProduct } from "@/app/actions/loan"
import { toast } from "sonner"
import { Pencil, Trash2, Package, AlertCircle } from "lucide-react"
import Link from "next/link"

export interface ProductRow {
  id: string
  name: string
  code: string | null
  interestRate: string | number
  interestType: string
  repaymentFreq: string
  numberOfInstallments: number
  minAmount: string | number
  maxAmount: string | number
  isActive: boolean
  _count?: { loans: number }
}

export default function LoanProductManager({ products }: { products: ProductRow[] }) {
  const handleToggle = async (id: string, current: boolean) => {
    try {
      await toggleLoanProductStatus(id, !current)
      toast.success(`Product ${!current ? "activated" : "deactivated"}`)
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed" })
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete product "${name}"? This cannot be undone.`)) return
    try {
      await deleteLoanProduct(id)
      toast.success("Product deleted")
    } catch (e) {
      toast.error("Cannot delete", { description: e instanceof Error ? e.message : "Failed" })
    }
  }

  return (
    <Card className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm rounded-2xl overflow-hidden">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50 hover:bg-transparent">
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Product</TableHead>
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Rate</TableHead>
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400">Tenure</TableHead>
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400 text-center">Active</TableHead>
              <TableHead className="px-4 py-3 text-[11px] uppercase tracking-widest font-bold text-slate-400 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Package className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-500">No loan products yet. Create one to start issuing loans.</p>
                </TableCell>
              </TableRow>
            ) : (
              products.map((p) => {
                const used = (p._count?.loans ?? 0) > 0
                return (
                  <TableRow key={p.id} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <TableCell className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center">
                          <Package className="h-4 w-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-slate-900 dark:text-white">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.code && <span className="text-[11px] font-mono text-slate-400">{p.code}</span>}
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 rounded-full capitalize">
                              {p.interestType.toLowerCase()}
                            </Badge>
                            {used && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" /> {p._count?.loans} loan(s)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                      <span className="font-bold text-sm text-slate-900 dark:text-white">{p.interestRate}%</span>
                      <p className="text-[11px] text-slate-400 capitalize">{p.repaymentFreq.toLowerCase()}</p>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                      {p.numberOfInstallments} inst.
                      <p className="text-[11px] text-slate-400">৳ {Number(p.minAmount).toLocaleString()} – {Number(p.maxAmount).toLocaleString()}</p>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-center">
                      <Switch checked={p.isActive} onCheckedChange={() => handleToggle(p.id, p.isActive)} />
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/dashboard/loans/products/${p.id}/edit`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 disabled:cursor-not-allowed"
                          disabled={used}
                          onClick={() => handleDelete(p.id, p.name)}
                          title={used ? "Cannot delete: in use" : "Delete"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
