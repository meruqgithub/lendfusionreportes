'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Container, Row, Col, Card, Button, Form, Table, Dropdown, InputGroup, FormControl, Alert } from 'react-bootstrap'
import { 
  BiArrowBack, BiDownload, BiFilter, BiCalendar, BiPrinter,
  BiDollar, BiTrendingUp, BiSearch, BiRefresh, BiX, BiFile, BiTable
} from 'react-icons/bi'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import * as autoTableModule from 'jspdf-autotable'

interface LoanData {
  loan_id: number;                      // Agregado (viene de la consulta)
  fecha_emision: string;
  numero_prestamo: string;
  nombre_cliente: string;
  nombre_analista: string | null;
  capital_sin_interes: number;
  porcentaje_interes: number;
  total_interes: number;
  total_capital_mas_interes: number;
  numero_cuotas: number;
  capital_cuota_mes: number;
  interes_cuota_mes: number;
  total_cuota_mes: number;
}

export default function ReportesFinanciacionPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loanData, setLoanData] = useState<LoanData[]>([])
  const [filteredData, setFilteredData] = useState<LoanData[]>([])
  
  // Estados para los filtros
  const [loanNumberFilter, setLoanNumberFilter] = useState('')
  const [clientNameFilter, setClientNameFilter] = useState('')
  const [analystFilter, setAnalystFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  
  // Estados para los totales
  const [totales, setTotales] = useState({
    montoFinanciado: 0,
    interesTotal: 0,
    montoTotal: 0
  })

  // Ref para capturar la tabla para PDF
  const tableRef = useRef<HTMLDivElement>(null)

  // Cargar datos iniciales
  useEffect(() => {
    loadData()
  }, [])

  // Aplicar filtros cuando cambien
  useEffect(() => {
    applyFilters()
  }, [loanNumberFilter, clientNameFilter, analystFilter, dateFromFilter, dateToFilter, loanData])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/loans')
      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al cargar datos')
      }
      
      // Ordenar de más reciente a más antigua por fecha_emision
      const sortedData = result.data.sort((a: LoanData, b: LoanData) => 
        new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime()
      )
      
      setLoanData(sortedData)
      setFilteredData(sortedData)
      calculateTotals(sortedData)
    } catch (error: any) {
      console.error('Error al cargar datos:', error)
      setError(error.message || 'Error al conectar con el servidor')
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...loanData]

    // Filtrar por número de préstamo
    if (loanNumberFilter) {
      filtered = filtered.filter(loan => 
        loan.numero_prestamo.toLowerCase().includes(loanNumberFilter.toLowerCase())
      )
    }

    // Filtrar por nombre de cliente
    if (clientNameFilter) {
      filtered = filtered.filter(loan => 
        loan.nombre_cliente.toLowerCase().includes(clientNameFilter.toLowerCase())
      )
    }

    // Filtrar por analista
    if (analystFilter) {
      if (analystFilter === 'vacios') {
        filtered = filtered.filter(loan => 
          !loan.nombre_analista || loan.nombre_analista.trim() === ''
        )
      } else {
        filtered = filtered.filter(loan => 
          loan.nombre_analista?.toLowerCase().includes(analystFilter.toLowerCase())
        )
      }
    }

    // Filtrar por fecha de emisión
    if (dateFromFilter) {
      const fromDate = new Date(dateFromFilter)
      fromDate.setHours(0, 0, 0, 0)
      filtered = filtered.filter(loan => {
        const loanDate = new Date(loan.fecha_emision)
        return loanDate >= fromDate
      })
    }

    if (dateToFilter) {
      const toDate = new Date(dateToFilter)
      toDate.setHours(23, 59, 59, 999) // Incluir todo el día
      filtered = filtered.filter(loan => {
        const loanDate = new Date(loan.fecha_emision)
        return loanDate <= toDate
      })
    }

    // Ordenar nuevamente después de filtrar (por si acaso)
    filtered.sort((a, b) => 
      new Date(b.fecha_emision).getTime() - new Date(a.fecha_emision).getTime()
    )

    setFilteredData(filtered)
    calculateTotals(filtered)
  }

  const calculateTotals = (data: LoanData[]) => {
    const totals = data.reduce((acc, loan) => ({
      montoFinanciado: acc.montoFinanciado + loan.capital_sin_interes,
      interesTotal: acc.interesTotal + loan.total_interes,
      montoTotal: acc.montoTotal + loan.total_capital_mas_interes
    }), { montoFinanciado: 0, interesTotal: 0, montoTotal: 0 })

    setTotales(totals)
  }

  const clearFilters = () => {
    setLoanNumberFilter('')
    setClientNameFilter('')
    setAnalystFilter('')
    setDateFromFilter('')
    setDateToFilter('')
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return format(date, 'dd/MM/yyyy HH:mm', { locale: es })
    } catch (error) {
      return dateString
    }
  }

  // Exportar a CSV
  const exportToCSV = () => {
    const headers = [
      'ID',
      'Número Préstamo',
      'Cliente',
      'Monto Financiado',
      'Tasa %',
      'Interés Total',
      'Monto Total',
      'Cuotas',
      'Analista',
      'Fecha Emisión',
      'Capital Cuota Mes',
      'Interés Cuota Mes',
      'Total Cuota'
    ]

    const csvData = filteredData.map(loan => [
      loan.loan_id,
      loan.numero_prestamo,
      `"${loan.nombre_cliente}"`,
      loan.capital_sin_interes,
      loan.porcentaje_interes,
      loan.total_interes,
      loan.total_capital_mas_interes,
      loan.numero_cuotas,
      loan.nombre_analista || '',
      loan.fecha_emision,
      loan.capital_cuota_mes,
      loan.interes_cuota_mes,
      loan.total_cuota_mes
    ])

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `reporte_financiacion_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Exportar a Excel
  const exportToExcel = () => {
    // Preparar los datos para Excel
    const excelData = filteredData.map(loan => ({
      'ID': loan.loan_id,
      'Número Préstamo': loan.numero_prestamo,
      'Cliente': loan.nombre_cliente,
      'Monto Financiado': loan.capital_sin_interes,
      'Tasa %': loan.porcentaje_interes,
      'Interés Total': loan.total_interes,
      'Monto Total': loan.total_capital_mas_interes,
      'Cuotas': loan.numero_cuotas,
      'Analista': loan.nombre_analista || 'Sin asignar',
      'Fecha Emisión': formatDate(loan.fecha_emision),
      'Capital Cuota Mes': loan.capital_cuota_mes,
      'Interés Cuota Mes': loan.interes_cuota_mes,
      'Total Cuota': loan.total_cuota_mes
    }))

    // Agregar fila de totales
    const totalesRow = {
      'ID': 'TOTALES',
      'Número Préstamo': '',
      'Cliente': '',
      'Monto Financiado': totales.montoFinanciado,
      'Tasa %': '',
      'Interés Total': totales.interesTotal,
      'Monto Total': totales.montoTotal,
      'Cuotas': '',
      'Analista': '',
      'Fecha Emisión': '',
      'Capital 1ª Cuota': '',
      'Interés 1ª Cuota': '',
      'Total 1ª Cuota': ''
    }

    const dataWithTotals = [...excelData, totalesRow]

    // Crear libro de trabajo
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(dataWithTotals)
    
    // Establecer anchos de columnas
    const colWidths = [
      { wch: 5 },   // ID
      { wch: 18 },  // Número Préstamo
      { wch: 40 },  // Cliente
      { wch: 15 },  // Monto Financiado
      { wch: 8 },   // Tasa %
      { wch: 15 },  // Interés Total
      { wch: 15 },  // Monto Total
      { wch: 8 },   // Cuotas
      { wch: 20 },  // Analista
      { wch: 20 },  // Fecha Emisión
      { wch: 15 },  // Capital 1ª Cuota
      { wch: 15 },  // Interés 1ª Cuota
      { wch: 15 }   // Total 1ª Cuota
    ]
    worksheet['!cols'] = colWidths

    // Agregar hoja al libro
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Financiación')

    // Generar archivo
    XLSX.writeFile(workbook, `reporte_financiacion_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  // Exportar a PDF
  const exportToPDF = async () => {
    try {
      // Crear documento PDF (jsPDF v4: constructor acepta objeto de opciones)
      const doc = new jsPDF({ orientation: 'landscape' })
      
      // Título principal
      doc.setFontSize(18)
      doc.setTextColor(41, 128, 185)
      doc.text('Reporte de Financiación', 14, 15)
      
      // Fecha de generación
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22)
      doc.text(`Total de registros: ${filteredData.length}`, 14, 27)
      
      // Información de filtros aplicados
      let yPos = 34
      const filters: string[] = []
      
      if (loanNumberFilter) filters.push(`Préstamo: ${loanNumberFilter}`)
      if (clientNameFilter) filters.push(`Cliente: ${clientNameFilter}`)
      if (analystFilter === 'vacios') {
        filters.push('Analista: Sin asignar')
      } else if (analystFilter) {
        filters.push(`Analista: ${analystFilter}`)
      }
      if (dateFromFilter || dateToFilter) {
        filters.push(`Fecha: ${dateFromFilter || 'Inicio'} a ${dateToFilter || 'Fin'}`)
      }
      
      if (filters.length > 0) {
        doc.setFontSize(9)
        doc.setTextColor(80, 80, 80)
        doc.text(`Filtros: ${filters.join(' | ')}`, 14, yPos)
        yPos += 7
      }
      
      // Barra de totales
      doc.setFillColor(41, 128, 185)
      doc.rect(14, yPos, 268, 10, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.text(`Total Financiado: $${formatCurrency(totales.montoFinanciado)}`, 16, yPos + 6.5)
      doc.text(`Total Interés: $${formatCurrency(totales.interesTotal)}`, 110, yPos + 6.5)
      doc.text(`Monto Total: $${formatCurrency(totales.montoTotal)}`, 200, yPos + 6.5)
      yPos += 15
      
      // Preparar encabezados de la tabla
      const tableHead = [[
        'ID',
        'N° Préstamo',
        'Cliente',
        'Monto Financiado',
        'Tasa %',
        'Interés Total',
        'Monto Total',
        'Cuotas',
        'Analista',
        'Fecha Emisión',
        'Capital Cuota',
        'Interés Cuota',
        'Total Cuota'
      ]]
      
      // Preparar filas con todos los financiamientos filtrados
      const tableBody = filteredData.map(loan => [
        (loan.loan_id ?? '').toString(),
        loan.numero_prestamo ?? '',
        loan.nombre_cliente ?? '',
        `$${formatCurrency(loan.capital_sin_interes ?? 0)}`,
        `${loan.porcentaje_interes ?? 0}%`,
        `$${formatCurrency(loan.total_interes ?? 0)}`,
        `$${formatCurrency(loan.total_capital_mas_interes ?? 0)}`,
        (loan.numero_cuotas ?? '').toString(),
        loan.nombre_analista || 'Sin asignar',
        formatDate(loan.fecha_emision ?? ''),
        `$${formatCurrency(loan.capital_cuota_mes ?? 0)}`,
        `$${formatCurrency(loan.interes_cuota_mes ?? 0)}`,
        `$${formatCurrency(loan.total_cuota_mes ?? 0)}`
      ])
      
      // Fila de totales al final
      tableBody.push([
        'TOTALES',
        '', '',
        `$${formatCurrency(totales.montoFinanciado)}`,
        '',
        `$${formatCurrency(totales.interesTotal)}`,
        `$${formatCurrency(totales.montoTotal)}`,
        '', '', '', '', '', ''
      ])
      
      // jspdf-autotable v5: resolución segura del export en Next.js
      const autoTable = (autoTableModule as any).default ?? (autoTableModule as any).autoTable ?? autoTableModule
      autoTable(doc, {
        startY: yPos,
        head: tableHead,
        body: tableBody,
        theme: 'grid',
        headStyles: {
          fillColor: [41, 128, 185],
          textColor: 255,
          fontSize: 7,
          fontStyle: 'bold',
          halign: 'center'
        },
        bodyStyles: {
          fontSize: 6.5
        },
        alternateRowStyles: {
          fillColor: [240, 248, 255]
        },
        // Estilo especial para la fila de TOTALES (la última)
        didParseCell: (data: any) => {
          if (data.row.index === tableBody.length - 1) {
            data.cell.styles.fontStyle = 'bold'
            data.cell.styles.fillColor = [41, 128, 185]
            data.cell.styles.textColor = [255, 255, 255]
          }
        },
        margin: { left: 14, right: 14 },
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
        styles: {
          overflow: 'linebreak',
          cellPadding: 1.5
        },
        columnStyles: {
          0:  { cellWidth: 10, halign: 'center' }, // ID
          1:  { cellWidth: 22 },                   // N° Préstamo
          2:  { cellWidth: 42 },                   // Cliente
          3:  { cellWidth: 22, halign: 'right' },  // Monto Financiado
          4:  { cellWidth: 12, halign: 'center' }, // Tasa %
          5:  { cellWidth: 22, halign: 'right' },  // Interés Total
          6:  { cellWidth: 22, halign: 'right' },  // Monto Total
          7:  { cellWidth: 12, halign: 'center' }, // Cuotas
          8:  { cellWidth: 25 },                   // Analista
          9:  { cellWidth: 24 },                   // Fecha Emisión
          10: { cellWidth: 20, halign: 'right' },  // Capital Cuota
          11: { cellWidth: 20, halign: 'right' },  // Interés Cuota
          12: { cellWidth: 20, halign: 'right' }   // Total Cuota
        }
      })
      
      // Pie de página en cada hoja — jsPDF v4 usa getNumberOfPages() directamente
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        const pageWidth = doc.internal.pageSize.getWidth()
        const pageHeight = doc.internal.pageSize.getHeight()
        doc.text(
          `Página ${i} de ${pageCount}  |  Reporte de Financiación LendFusion`,
          pageWidth / 2,
          pageHeight - 5,
          { align: 'center' }
        )
      }
      
      // Guardar PDF
      doc.save(`reporte_financiacion_${new Date().toISOString().split('T')[0]}.pdf`)
      
    } catch (error) {
      console.error('Error al generar PDF:', error)
      alert('Error al generar el PDF. Verifique la consola para más detalles.')
    }
  }

  // Obtener lista única de analistas
  const uniqueAnalysts = useMemo(() => {
    const analysts = new Set(
      loanData.map(loan => loan.nombre_analista).filter(a => a && a.trim() !== '')
    )
    return Array.from(analysts).sort()
  }, [loanData])

  if (loading) {
    return (
      <AuthGuard>
        <Container fluid className="p-4">
          <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Cargando...</span>
              </div>
              <p>Cargando datos de financiación...</p>
            </div>
          </div>
        </Container>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard>
      <Container fluid className="p-4">
        {/* Header */}
        <Row className="mb-4">
          <Col>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <h1 className="h3 mb-0">Reportes de Financiación</h1>
                <nav aria-label="breadcrumb">
                  <ol className="breadcrumb mb-0">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">Dashboard</Link>
                    </li>
                    <li className="breadcrumb-item active" aria-current="page">
                      Reportes de Financiación
                    </li>
                  </ol>
                </nav>
              </div>
              <div>
                <Link href="/dashboard" passHref legacyBehavior>
                  <Button variant="outline-primary" className="me-2">
                    <BiArrowBack className="me-1" />
                    Volver al Dashboard
                  </Button>
                </Link>
                <Button variant="outline-success" onClick={loadData} className="me-2">
                  <BiRefresh className="me-1" />
                  Actualizar
                </Button>
                <Dropdown>
                  <Dropdown.Toggle variant="primary" id="dropdown-export">
                    <BiDownload className="me-1" />
                    Exportar
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    <Dropdown.Item onClick={exportToExcel}>
                      <BiTable className="me-2" />
                      Excel
                    </Dropdown.Item>
                    <Dropdown.Item onClick={exportToPDF}>
                      <BiFile className="me-2" />
                      PDF
                    </Dropdown.Item>
                    <Dropdown.Item onClick={exportToCSV}>
                      <BiFile className="me-2" />
                      CSV
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              </div>
            </div>
          </Col>
        </Row>

        {/* Mostrar error si existe */}
        {error && (
          <Row className="mb-4">
            <Col>
              <Alert variant="danger">
                <strong>Error:</strong> {error}
                <div className="mt-2">
                  <Button variant="outline-danger" size="sm" onClick={loadData}>
                    <BiRefresh className="me-1" />
                    Reintentar
                  </Button>
                </div>
              </Alert>
            </Col>
          </Row>
        )}

        {/* Filtros */}
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
                    <BiX className="me-1" />
                    Limpiar Filtros
                  </Button>
                </div>
                <Row>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Número de Préstamo</Form.Label>
                      <InputGroup>
                        <InputGroup.Text>
                          <BiSearch />
                        </InputGroup.Text>
                        <FormControl
                          placeholder="Ej: L251212005"
                          value={loanNumberFilter}
                          onChange={(e) => setLoanNumberFilter(e.target.value)}
                        />
                      </InputGroup>
                    </Form.Group>
                  </Col>
                  
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Nombre del Cliente</Form.Label>
                      <InputGroup>
                        <InputGroup.Text>
                          <BiSearch />
                        </InputGroup.Text>
                        <FormControl
                          placeholder="Buscar cliente..."
                          value={clientNameFilter}
                          onChange={(e) => setClientNameFilter(e.target.value)}
                        />
                      </InputGroup>
                    </Form.Group>
                  </Col>
                  
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Analista Asignado</Form.Label>
                      <Form.Select 
                        value={analystFilter} 
                        onChange={(e) => setAnalystFilter(e.target.value)}
                      >
                        <option value="">Todos los analistas</option>
                        <option value="vacios">Sin analista asignado</option>
                        {uniqueAnalysts.map((analyst, index) => (
                          <option key={index} value={analyst}>
                            {analyst}
                          </option>
                        ))}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Fecha Emisión Desde</Form.Label>
                      <Form.Control
                        type="date"
                        value={dateFromFilter}
                        onChange={(e) => setDateFromFilter(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>
                
                <Row>
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>Fecha Emisión Hasta</Form.Label>
                      <Form.Control
                        type="date"
                        value={dateToFilter}
                        onChange={(e) => setDateToFilter(e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  
                  <Col md={9}>
                    <div className="d-flex align-items-end h-100">
                      <div className="text-muted">
                        Mostrando {filteredData.length} de {loanData.length} registros
                      </div>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Totales */}
        <Row className="mb-4">
          <Col md={4}>
            <Card className="border-primary">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 className="text-muted">Total Financiado</h6>
                    <h3 className="mb-0">${formatCurrency(totales.montoFinanciado)}</h3>
                  </div>
                  <div className="bg-primary p-3 rounded-circle">
                    <BiDollar size={24} className="text-white" />
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={4}>
            <Card className="border-warning">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 className="text-muted">Total Interés</h6>
                    <h3 className="mb-0">${formatCurrency(totales.interesTotal)}</h3>
                  </div>
                  <div className="bg-warning p-3 rounded-circle">
                    <BiTrendingUp size={24} className="text-white" />
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
          
          <Col md={4}>
            <Card className="border-success">
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <h6 className="text-muted">Monto Total</h6>
                    <h3 className="mb-0">${formatCurrency(totales.montoTotal)}</h3>
                  </div>
                  <div className="bg-success p-3 rounded-circle">
                    <BiDollar size={24} className="text-white" />
                  </div>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Tabla de datos - Agregar ref para PDF */}
        <div ref={tableRef}>
          <Row>
            <Col>
              <Card>
                <Card.Header>
                  <div className="d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Detalle de Financiaciones</h5>
                    <div>
                      <Button variant="outline-primary" className="me-2" onClick={exportToPDF}>
                        <BiPrinter className="me-1" />
                        Imprimir/PDF
                      </Button>
                      <Button variant="primary" onClick={exportToExcel}>
                        <BiDownload className="me-1" />
                        Exportar Excel
                      </Button>
                    </div>
                  </div>
                </Card.Header>
                <Card.Body className="p-0">
                  <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                    <Table striped hover className="mb-0">
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>
                        <tr>
                          <th>ID</th>
                          <th>Número Préstamo</th>
                          <th>Cliente</th>
                          <th>Monto Financiado</th>
                          <th>Tasa %</th>
                          <th>Interés Total</th>
                          <th>Monto Total</th>
                          <th>Cuotas</th>
                          <th>Analista</th>
                          <th>Fecha Emisión</th>
                          <th>Capital Cuota Mes</th>
                          <th>Interés Cuota Mes</th>
                          <th>Total Cuota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredData.length === 0 ? (
                          <tr>
                            <td colSpan={13} className="text-center py-4">
                              <div className="text-muted">
                                {loanData.length === 0 
                                  ? 'No hay datos disponibles' 
                                  : 'No se encontraron registros con los filtros aplicados'}
                              </div>
                            </td>
                          </tr>
                        ) : (
                          filteredData.map((loan) => (
                            <tr key={loan.loan_id}>
                              <td>{loan.loan_id}</td>
                              <td>
                                <strong>{loan.numero_prestamo}</strong>
                              </td>
                              <td>
                                <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {loan.nombre_cliente}
                                </div>
                              </td>
                              <td className="text-end">${formatCurrency(loan.capital_sin_interes)}</td>
                              <td className="text-center">{loan.porcentaje_interes}%</td>
                              <td className="text-end">${formatCurrency(loan.total_interes)}</td>
                              <td className="text-end">
                                <strong>${formatCurrency(loan.total_capital_mas_interes)}</strong>
                              </td>
                              <td className="text-center">{loan.numero_cuotas}</td>
                              <td>
                                {loan.nombre_analista ? (
                                  <span className="badge bg-info">{loan.nombre_analista}</span>
                                ) : (
                                  <span className="badge bg-secondary">Sin asignar</span>
                                )}
                              </td>
                              <td>{formatDate(loan.fecha_emision)}</td>
                              <td className="text-end">${formatCurrency(loan.capital_cuota_mes)}</td>
                              <td className="text-end">${formatCurrency(loan.interes_cuota_mes)}</td>
                              <td className="text-end">${formatCurrency(loan.total_cuota_mes)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </Table>
                  </div>
                </Card.Body>
                <Card.Footer className="text-muted">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      Mostrando {filteredData.length} de {loanData.length} registros
                    </div>
                    <div className="text-end">
                      <small>
                        <strong>Totales filtrados:</strong> ${formatCurrency(totales.montoFinanciado)} financiado | ${formatCurrency(totales.interesTotal)} interés | ${formatCurrency(totales.montoTotal)} total
                      </small>
                    </div>
                  </div>
                </Card.Footer>
              </Card>
            </Col>
          </Row>
        </div>
      </Container>
    </AuthGuard>
  )
}