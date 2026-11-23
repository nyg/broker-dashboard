import type { ReactNode } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface Column<T> {
   header: string
   cell: (row: T) => ReactNode
   numeric?: boolean
   className?: (row: T) => string
}

interface TableCardProps<T> {
   title: string
   description?: string
   rows: T[]
   columns: Column<T>[]
   rowKey: (row: T, index: number) => string
   rowClassName?: (row: T) => string
   empty?: string
}

export function TableCard<T>({ title, description, rows, columns, rowKey, rowClassName, empty = 'None' }: TableCardProps<T>) {
   return (
      <Card>
         <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
         </CardHeader>
         <CardContent>
            {rows.length === 0
               ? <p className="text-sm text-muted-foreground">{empty}</p>
               : (
                  <Table>
                     <TableHeader>
                        <TableRow>
                           {columns.map(column => (
                              <TableHead key={column.header} className={cn(column.numeric && 'text-right')}>{column.header}</TableHead>
                           ))}
                        </TableRow>
                     </TableHeader>
                     <TableBody>
                        {rows.map((row, index) => (
                           <TableRow key={rowKey(row, index)} className={rowClassName?.(row)}>
                              {columns.map(column => (
                                 <TableCell
                                    key={column.header}
                                    className={cn(column.numeric && 'text-right tabular-nums', column.className?.(row))}
                                 >
                                    {column.cell(row)}
                                 </TableCell>
                              ))}
                           </TableRow>
                        ))}
                     </TableBody>
                  </Table>
               )}
         </CardContent>
      </Card>
   )
}
