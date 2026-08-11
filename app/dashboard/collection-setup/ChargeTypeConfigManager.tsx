"use client"

import { useState } from "react"
import {
  updateChargeTypeConfig,
  deleteChargeTypeConfig,
  toggleChargeTypeConfigStatus,
} from "@/app/actions/finance"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Zap, Trash2, Pencil, AlertCircle } from "lucide-react"

/** A Charge Type config row — subset of the ChargeTypeConfig model rendered here. */
interface ChargeTypeConfig {
  id: string
  name: string
  isActive: boolean
}

export default function ChargeTypeConfigManager({
  configs,
  usedNames,
}: {
  configs: ChargeTypeConfig[]
  usedNames: string[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")

  const handleEdit = (config: ChargeTypeConfig) => {
    setEditingId(config.id)
    setEditName(config.name)
  }

  const handleSaveEdit = async () => {
    try {
      await updateChargeTypeConfig(editingId!, editName)
      toast.success("Charge Type Updated")
      setEditingId(null)
    } catch (error) {
      toast.error("Error", { description: error instanceof Error ? error.message : "Failed" })
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    try {
      await deleteChargeTypeConfig(id)
      toast.success("Charge Type Deleted")
    } catch (error) {
      toast.error("Cannot Delete", { description: error instanceof Error ? error.message : "Failed" })
    }
  }

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      await toggleChargeTypeConfigStatus(id, !currentStatus)
      toast.success(`Charge Type ${!currentStatus ? "Activated" : "Deactivated"}`)
    } catch (error) {
      toast.error("Error", { description: error instanceof Error ? error.message : "Failed" })
    }
  }

  return (
    <div className="lg:col-span-2 space-y-4">
      <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
        <Zap className="h-5 w-5 text-amber-600" /> Existing Charge Types
      </h2>
      <Card className="bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500">Name</TableHead>
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 text-center">Status</TableHead>
                <TableHead className="px-4 py-3 text-xs uppercase font-bold text-slate-500 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {configs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-slate-500">No charge types created yet.</TableCell>
                </TableRow>
              ) : (
                configs.map((config) => {
                  const isUsed = usedNames.includes(config.name)
                  return (
                    <TableRow key={config.id} className="border-b border-slate-100 dark:border-slate-800">
                      <TableCell className="px-4 py-4 font-medium text-slate-900 dark:text-white">
                        {config.name}
                        {isUsed && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-0.5 rounded-full">
                            <AlertCircle className="w-3 h-3" /> In Use
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-center">
                        <Switch
                          checked={config.isActive}
                          onCheckedChange={() => handleToggle(config.id, config.isActive)}
                        />
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Edit name Dialog */}
                          <Dialog open={editingId === config.id} onOpenChange={(open) => !open && setEditingId(null)}>
                            <DialogTrigger className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 h-8 w-8 p-0 cursor-pointer outline-none text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-indigo-950/30" onClick={() => handleEdit(config)}>
                              <Pencil className="h-4 w-4" />
                            </DialogTrigger>
                            <DialogContent className="max-w-sm bg-white dark:bg-slate-950 rounded-2xl">
                              <DialogHeader>
                                <DialogTitle>Edit Charge Type</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="editName">Type Name</Label>
                                  <Input id="editName" value={editName} onChange={(e) => setEditName(e.target.value)} />
                                </div>
                                <Button onClick={handleSaveEdit} className="w-full bg-indigo-600 hover:bg-indigo-700">Save Changes</Button>
                              </div>
                            </DialogContent>
                          </Dialog>

                          {/* Delete Button (Disabled if in use) */}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            onClick={() => handleDelete(config.id, config.name)}
                            disabled={isUsed}
                            title={isUsed ? "Cannot delete: Used on existing transactions" : "Delete"}
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
    </div>
  )
}
