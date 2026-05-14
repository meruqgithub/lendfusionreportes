'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Container, Row, Col, Card, Button, Form,
  Table, Dropdown, InputGroup, FormControl, Alert
} from 'react-bootstrap'
import {
  BiArrowBack, BiDownload, BiFilter, BiPrinter,
  BiDollar, BiSearch, BiRefresh, BiX, BiFile, BiTable, BiTrendingUp
} from 'react-icons/bi'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

/* ─── Tipo que coincide con el SELECT del API ─── */
interface DebitRecord {
  numero_prestamo: string
  nombre_cliente: string
  analista: string | null
  fecha_cargo: string
  descripcion_cargo: string
  monto: number
}

export default function ReportesDebitosPage() {
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [rawData, setRawData]           = useState<DebitRecord[]>([])
  const [filteredData, setFilteredData] = useState<DebitRecord[]>([])

  /* ── Filtros ── */
  const [loanNumberFilter,  setLoanNumberFilter]  = useState('')
  const [clientNameFilter,  setClientNameFilter]  = useState('')
  const [analistaFilter,    setAnalistaFilter]    = useState('')
  const [dateFromFilter,    setDateFromFilter]    = useState('')
  const [dateToFilter,      setDateToFilter]      = useState('')

  /* ── Totales ── */
  const [montoTotal, setMontoTotal] = useState(0)

  const tableRef = useRef<HTMLDivElement>(null)

  /* ─── Carga inicial ─── */
  useEffect(() => { loadData() }, [])

  /* ─── Aplicar filtros cuando cambien los estados ─── */
  useEffect(() => { applyFilters() }, [
    loanNumberFilter, clientNameFilter, analistaFilter, dateFromFilter, dateToFilter, rawData
  ])

  /* ─── Cargar datos del API ─── */
  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/debit')
      const result   = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al cargar datos')
      }

      const sorted: DebitRecord[] = result.data.sort(
        (a: DebitRecord, b: DebitRecord) =>
          new Date(b.fecha_cargo).getTime() - new Date(a.fecha_cargo).getTime()
      )

      setRawData(sorted)
      setFilteredData(sorted)
      calcTotals(sorted)
    } catch (err: any) {
      console.error('Error al cargar datos:', err)
      setError(err.message || 'Error al conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }

  /* ─── Filtrado ─── */
  const applyFilters = () => {
    let data = [...rawData]

    if (loanNumberFilter) {
      data = data.filter(r =>
        r.numero_prestamo?.toLowerCase().includes(loanNumberFilter.toLowerCase())
      )
    }

    if (clientNameFilter) {
      data = data.filter(r =>
        r.nombre_cliente?.toLowerCase().includes(clientNameFilter.toLowerCase())
      )
    }

    if (analistaFilter) {
      data = data.filter(r =>
        r.analista?.toLowerCase().includes(analistaFilter.toLowerCase())
      )
    }

    if (dateFromFilter) {
      const from = new Date(dateFromFilter)
      from.setHours(0, 0, 0, 0)
      data = data.filter(r => new Date(r.fecha_cargo) >= from)
    }

    if (dateToFilter) {
      const to = new Date(dateToFilter)
      to.setHours(23, 59, 59, 999)
      data = data.filter(r => new Date(r.fecha_cargo) <= to)
    }

    setFilteredData(data)
    calcTotals(data)
  }

  /* ─── Calcular totales ─── */
  const calcTotals = (data: DebitRecord[]) => {
    const total = data.reduce((acc, r) => acc + (r.monto || 0), 0)
    setMontoTotal(total)
  }

  const clearFilters = () => {
    setLoanNumberFilter('')
    setClientNameFilter('')
    setAnalistaFilter('')
    setDateFromFilter('')
    setDateToFilter('')
  }

  /* ─── Formatos ─── */
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateString
    }
  }

  /* ─── Exportar CSV ─── */
  const exportToCSV = () => {
    const headers = ['Número Préstamo', 'Nombre Cliente', 'Analista', 'Fecha Cargo', 'Descripción', 'Monto']
    const rows = filteredData.map(r => [
      r.numero_prestamo,
      `"${r.nombre_cliente}"`,
      r.analista || '',
      r.fecha_cargo,
      `"${r.descripcion_cargo}"`,
      r.monto
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.setAttribute('download', `reporte_debitos_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  /* ─── Exportar Excel ─── */
  const exportToExcel = () => {
    const excelData = filteredData.map(r => ({
      'Número Préstamo': r.numero_prestamo,
      'Nombre Cliente':  r.nombre_cliente,
      'Analista':        r.analista || '',
      'Fecha Cargo':     formatDate(r.fecha_cargo),
      'Descripción':     r.descripcion_cargo,
      'Monto':           r.monto
    }))

    excelData.push({
      'Número Préstamo': 'TOTAL',
      'Nombre Cliente':  '',
      'Analista':        '',
      'Fecha Cargo':     '',
      'Descripción':     '',
      'Monto':           montoTotal
    } as any)

    const wb  = XLSX.utils.book_new()
    const ws  = XLSX.utils.json_to_sheet(excelData)
    ws['!cols'] = [
      { wch: 20 }, { wch: 35 }, { wch: 25 }, { wch: 15 }, { wch: 35 }, { wch: 15 }
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Débitos')
    XLSX.writeFile(wb, `reporte_debitos_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  /* ─── Exportar PDF ─── */
  const exportToPDF = () => {
    const doc = new jsPDF('landscape')

    doc.setFontSize(16)
    doc.text('Reporte de Débitos', 14, 15)
    doc.setFontSize(10)
    doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22)

    let yPos = 30
    const filters: string[] = []
    if (loanNumberFilter) filters.push(`Préstamo: ${loanNumberFilter}`)
    if (clientNameFilter)  filters.push(`Cliente: ${clientNameFilter}`)
    if (analistaFilter)    filters.push(`Analista: ${analistaFilter}`)
    if (dateFromFilter || dateToFilter)
      filters.push(`Fecha: ${dateFromFilter || 'inicio'} → ${dateToFilter || 'fin'}`)

    if (filters.length) {
      doc.text(`Filtros: ${filters.join(', ')}`, 14, yPos)
      yPos += 8
    }

    doc.setFontSize(11)
    doc.text(`Monto Total: $${formatCurrency(montoTotal)}`, 14, yPos)
    yPos += 10

    const headers = [['Nº Préstamo', 'Cliente', 'Analista', 'Fecha', 'Descripción', 'Monto']]
    const body = filteredData.map(r => [
      r.numero_prestamo,
      r.nombre_cliente,
      r.analista || '—',
      formatDate(r.fecha_cargo),
      r.descripcion_cargo,
      `$${formatCurrency(r.monto)}`
    ])
    body.push(['TOTALES', '', '', '', '', `$${formatCurrency(montoTotal)}`])

    ;(doc as any).autoTable({
      startY:   yPos,
      head:     headers,
      body:     body,
      theme:    'grid',
      headStyles:        { fillColor: [33, 37, 41], textColor: 255, fontSize: 8 },
      bodyStyles:        { fontSize: 7 },
      alternateRowStyles:{ fillColor: [245, 245, 245] },
      margin: { left: 14, right: 14 }
    })

    const pageCount = (doc as any).internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.text(
        `Página ${i} de ${pageCount}`,
        doc.internal.pageSize.width - 30,
        doc.internal.pageSize.height - 10
      )
    }

    doc.save(`reporte_debitos_${new Date().toISOString().split('T')[0]}.pdf`)
  }

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <AuthGuard>
        <Container fluid className="p-4">
          <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
            <div className="text-center">
              <div className="spinner-border text-dark mb-3" role="status">
                <span className="visually-hidden">Cargando...</span>
              </div>
              <p>Cargando datos de débitos...</p>
            </div>
          </div>
        </Container>
      </AuthGuard>
    )
  }

  /* ─── Render principal ─── */
  return (
    <AuthGuard>
      <Container fluid className="p-4">

        {/* ── Header ── */}
        <Row className="mb-4">
          <Col>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h1 className="h3 mb-0">
                  <BiTrendingUp className="me-2 text-dark" />
                  Reporte de Débitos
                </h1>
                <nav aria-label="breadcrumb">
                  <ol className="breadcrumb mb-0">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">Dashboard</Link>
                    </li>
                    <li className="breadcrumb-item active" aria-current="page">
                      Reporte de Débitos
                    </li>
                  </ol>
                </nav>
              </div>

              <div className="d-flex gap-2">
                <Link href="/dashboard" passHref legacyBehavior>
                  <Button variant="outline-secondary">
                    <BiArrowBack className="me-1" />
                    Volver
                  </Button>
                </Link>

                <Button variant="outline-dark" onClick={loadData}>
                  <BiRefresh className="me-1" />
                  Actualizar
                </Button>

                <Dropdown>
                  <Dropdown.Toggle variant="dark" id="dropdown-export-debitos">
                    <BiDownload className="me-1" />
                    Exportar
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    <Dropdown.Item onClick={exportToExcel}>
                      <BiTable className="me-2" />Excel
                    </Dropdown.Item>
                    <Dropdown.Item onClick={exportToPDF}>
                      <BiFile className="me-2" />PDF
                    </Dropdown.Item>
                    <Dropdown.Item onClick={exportToCSV}>
                      <BiFile className="me-2" />CSV
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </div>
            </div>
          </Col>
        </Row>

        {/* ── Error ── */}
        {error && (
          <Row className="mb-4">
            <Col>
              <Alert variant="danger">
                <strong>Error:</strong> {error}
                <div className="mt-2">
                  <Button variant="outline-danger" size="sm" onClick={loadData}>
                    <BiRefresh className="me-1" />Reintentar
                  </Button>
                </div>
              </Alert>
            </Col>
          </Row>
        )}

        {/* ── Card resumen ── */}
        <Row className="mb-4">
          <Col md={4}>
            <Card className="border-dark shadow-sm">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 className="text-muted mb-1">Monto Total Débitos</h6>
                    <h3 className="mb-0 fw-bold">
                      ${formatCurrency(montoTotal)}
                    </h3>
                    <small className="text-muted">{filteredData.length} registros</small>
                  </div>
                  <div className="bg-dark p-3 rounded-circle">
                    <BiDollar size={28} className="text-white" />
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* ── Filtros ── */}
        <Row className="mb-4">
          <Col>
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="card-title mb-0">
                    <BiFilter className="me-2" />
                    Filtros de Búsqueda
                  </h5>
                  <Button variant="outline-secondary" size="sm" onClick={clearFilters}>
                    <BiX className="me-1" />Limpiar Filtros
                  </Button>
                </div>

                <Row>
                  {/* Número de préstamo */}
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Número de Préstamo</Form.Label>
                      <InputGroup>
                        <InputGroup.Text><BiSearch /></InputGroup.Text>
                        <FormControl
                          placeholder="Ej: L251212005"
                          value={loanNumberFilter}
                          onChange={e => setLoanNumberFilter(e.target.value)}
                        />
                      </InputGroup>
                    </Form.Group>
                  </Col>

                  {/* Nombre cliente */}
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Nombre del Cliente</Form.Label>
                      <InputGroup>
                        <InputGroup.Text><BiSearch /></InputGroup.Text>
                        <FormControl
                          placeholder="Buscar cliente..."
                          value={clientNameFilter}
                          onChange={e => setClientNameFilter(e.target.value)}
                        />
                      </InputGroup>
                    </Form.Group>
                  </Col>

                  {/* Analista */}
                  <Col md={2}>
                    <Form.Group className="mb-3">
                      <Form.Label>Analista</Form.Label>
                      <InputGroup>
                        <InputGroup.Text><BiSearch /></InputGroup.Text>
                        <FormControl
                          placeholder="Buscar analista..."
                          value={analistaFilter}
                          onChange={e => setAnalistaFilter(e.target.value)}
                        />
                      </InputGroup>
                    </Form.Group>
                  </Col>

                  {/* Fecha Desde */}
                  <Col md={2}>
                    <Form.Group className="mb-3">
                      <Form.Label>Fecha Desde</Form.Label>
                      <Form.Control
                        type="date"
                        value={dateFromFilter}
                        onChange={e => setDateFromFilter(e.target.value)}
                      />
                    </Form.Group>
                  </Col>

                  {/* Fecha Hasta */}
                  <Col md={2}>
                    <Form.Group className="mb-3">
                      <Form.Label>Fecha Hasta</Form.Label>
                      <Form.Control
                        type="date"
                        value={dateToFilter}
                        onChange={e => setDateToFilter(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <div className="text-muted small">
                  Mostrando {filteredData.length} de {rawData.length} registros
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* ── Tabla de datos ── */}
        <div ref={tableRef}>
          <Row>
            <Col>
              <Card>
                <Card.Header>
                  <div className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Detalle de Débitos</h5>
                    <div className="d-flex gap-2">
                      <Button variant="outline-dark" size="sm" onClick={exportToPDF}>
                        <BiPrinter className="me-1" />PDF
                      </Button>
                      <Button variant="dark" size="sm" onClick={exportToExcel}>
                        <BiDownload className="me-1" />Excel
                      </Button>
                    </div>
                  </div>
                </Card.Header>

                <Card.Body className="p-0">
                  <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    <Table striped hover className="mb-0">
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>
                        <tr>
                          <th>#</th>
                          <th>Número Préstamo</th>
                          <th>Nombre Cliente</th>
                          <th>Analista</th>
                          <th>Fecha Cargo</th>
                          <th>Descripción</th>
                          <th className="text-end">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredData.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-4 text-muted">
                              {rawData.length === 0
                                ? 'No hay datos disponibles'
                                : 'No se encontraron registros con los filtros aplicados'}
                            </td>
                          </tr>
                        ) : (
                          filteredData.map((record, index) => (
                            <tr key={index}>
                              <td className="text-muted">{index + 1}</td>
                              <td>
                                <strong>{record.numero_prestamo}</strong>
                              </td>
                              <td>{record.nombre_cliente}</td>
                              <td>
                                {record.analista ? (
                                  <span className="badge bg-secondary">{record.analista}</span>
                                ) : (
                                  <span className="text-muted">—</span>
                                )}
                              </td>
                              <td>{formatDate(record.fecha_cargo)}</td>
                              <td>
                                <span className="badge bg-dark">{record.descripcion_cargo}</span>
                              </td>
                              <td className="text-end">
                                <strong>
                                  ${formatCurrency(record.monto)}
                                </strong>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>

                      {filteredData.length > 0 && (
                        <tfoot>
                          <tr className="table-dark fw-bold">
                            <td colSpan={6} className="text-end">Monto Total Débitos:</td>
                            <td className="text-end">${formatCurrency(montoTotal)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </Table>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </div>

      </Container>
    </AuthGuard>
  )
}
