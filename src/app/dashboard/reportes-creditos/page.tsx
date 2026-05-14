'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Container, Row, Col, Card, Button, Form, Table, Dropdown, InputGroup, FormControl, Alert } from 'react-bootstrap'
import { 
  BiArrowBack, BiDownload, BiFilter, BiCalendar, BiPrinter,
  BiDollar, BiTrendingUp, BiSearch, BiRefresh, BiX, BiFile, BiTable, BiUser, BiBuilding
} from 'react-icons/bi'
import Link from 'next/link'
import AuthGuard from '@/components/AuthGuard'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

// Interfaz para los datos de créditos según la consulta SQL
interface CreditData {
  fecha: string;
  tipo: string;           // 'Waive', 'Reverso', 'Anulación', 'Ajuste', 'Otro', 'Ingreso', 'Egreso'
  monto: number;
  moneda: string;
  prestamo: string;
  descripcion: string;
  banco: string;
  cliente: string;
  analista: string;
}

export default function ReportesCreditosPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creditData, setCreditData] = useState<CreditData[]>([])
  const [filteredData, setFilteredData] = useState<CreditData[]>([])
  
  // Estados para los filtros
  const [bancoFilter, setBancoFilter] = useState('')
  const [analistaFilter, setAnalistaFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')
  
  // Estado para totales
  const [totalMonto, setTotalMonto] = useState(0)

  // Ref para capturar la tabla para PDF
  const tableRef = useRef<HTMLDivElement>(null)

  // Cargar datos iniciales
  useEffect(() => {
    loadData()
  }, [])

  // Aplicar filtros cuando cambien
  useEffect(() => {
    applyFilters()
  }, [bancoFilter, analistaFilter, dateFromFilter, dateToFilter, creditData])

  const loadData = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/credit')
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.indexOf('text/html') !== -1) {
        throw new Error('La API de créditos no está disponible (404).')
      }

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Error al cargar datos de créditos')
      }

      // 🔁 Normalizar propiedades y convertir monto a número
      const processedData = result.data.map((item: any) => ({
        fecha: item.Fecha || item.fecha || '',
        tipo: item.Tipo || item.tipo || '',
        monto: parseFloat(item.Monto ?? item.monto) || 0,
        moneda: item.Moneda || item.moneda || '',
        prestamo: item.Prestamo || item.prestamo || '',
        descripcion: item.Descripcion || item.descripcion || '',
        banco: item.Banco || item.banco || '',
        cliente: item.Cliente || item.cliente || '',
        analista: item.Analista || item.analista || '',
      }))

      // Ordenar por fecha descendente
      const sortedData = processedData.sort((a, b) => {
        const dateA = new Date(a.fecha).getTime()
        const dateB = new Date(b.fecha).getTime()
        if (isNaN(dateA) && isNaN(dateB)) return 0
        if (isNaN(dateA)) return 1
        if (isNaN(dateB)) return -1
        return dateB - dateA
      })

      setCreditData(sortedData)
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
    let filtered = [...creditData]

    // Filtrar por banco
    if (bancoFilter) {
      filtered = filtered.filter(credit => 
        credit.banco.toLowerCase().includes(bancoFilter.toLowerCase())
      )
    }

    // Filtrar por analista
    if (analistaFilter) {
      filtered = filtered.filter(credit => 
        credit.analista.toLowerCase().includes(analistaFilter.toLowerCase())
      )
    }

    // Filtrar por fecha
    if (dateFromFilter) {
      const fromDate = new Date(dateFromFilter)
      filtered = filtered.filter(credit => {
        const creditDate = new Date(credit.fecha)
        return creditDate >= fromDate
      })
    }

    if (dateToFilter) {
      const toDate = new Date(dateToFilter)
      toDate.setHours(23, 59, 59, 999)
      filtered = filtered.filter(credit => {
        const creditDate = new Date(credit.fecha)
        return creditDate <= toDate
      })
    }

    // Ordenar por fecha descendente
    filtered.sort((a, b) => {
      const dateA = new Date(a.fecha).getTime()
      const dateB = new Date(b.fecha).getTime()
      if (isNaN(dateA) && isNaN(dateB)) return 0
      if (isNaN(dateA)) return 1
      if (isNaN(dateB)) return -1
      return dateB - dateA
    })

    setFilteredData(filtered)
    calculateTotals(filtered)
  }

  const calculateTotals = (data: CreditData[]) => {
    const total = data.reduce((acc, credit) => acc + credit.monto, 0)
    setTotalMonto(total)
  }

  const clearFilters = () => {
    setBancoFilter('')
    setAnalistaFilter('')
    setDateFromFilter('')
    setDateToFilter('')
  }

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    if (isNaN(num)) return '$0.00'
    return new Intl.NumberFormat('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: 'auto'
    }).format(num)
  }

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return format(date, 'dd/MM/yyyy HH:mm', { locale: es })
    } catch (error) {
      return dateString
    }
  }

  // Agrupar datos por banco
  const groupedByBank = useMemo(() => {
    const grouped: { [key: string]: CreditData[] } = {}
    
    filteredData.forEach(credit => {
      const bank = credit.banco || 'Sin banco'
      if (!grouped[bank]) {
        grouped[bank] = []
      }
      grouped[bank].push(credit)
    })
    
    // Ordenar bancos alfabéticamente
    return Object.keys(grouped)
      .sort()
      .reduce((acc, key) => {
        acc[key] = grouped[key]
        return acc
      }, {} as { [key: string]: CreditData[] })
  }, [filteredData])

  // Calcular total por banco
  const calculateBankTotal = (bankData: CreditData[]) => {
    return bankData.reduce((acc, credit) => acc + credit.monto, 0)
  }

  // Obtener lista única de bancos para el filtro
  const uniqueBanks = useMemo(() => {
    const banks = new Set(creditData.map(credit => credit.banco).filter(b => b))
    return Array.from(banks).sort()
  }, [creditData])

  // Obtener lista única de analistas para el filtro
  const uniqueAnalistas = useMemo(() => {
    const analistas = new Set(creditData.map(credit => credit.analista).filter(a => a))
    return Array.from(analistas).sort()
  }, [creditData])

  if (loading) {
    return (
      <AuthGuard>
        <Container fluid className="p-4">
          <div className="d-flex justify-content-center align-items-center" style={{ height: '50vh' }}>
            <div className="text-center">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Cargando...</span>
              </div>
              <p>Cargando datos de créditos...</p>
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
                <h1 className="h3 mb-0">Reportes de Créditos por Banco</h1>
                <nav aria-label="breadcrumb">
                  <ol className="breadcrumb mb-0">
                    <li className="breadcrumb-item">
                      <Link href="/dashboard">Dashboard</Link>
                    </li>
                    <li className="breadcrumb-item active" aria-current="page">
                      Créditos por Banco
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
                      <Form.Label>
                        <BiBuilding className="me-1" />
                        Banco
                      </Form.Label>
                      <InputGroup>
                        <InputGroup.Text>
                          <BiSearch />
                        </InputGroup.Text>
                        <FormControl
                          placeholder="Buscar banco..."
                          value={bancoFilter}
                          onChange={(e) => setBancoFilter(e.target.value)}
                          list="bankSuggestions"
                        />
                        <datalist id="bankSuggestions">
                          {uniqueBanks.map((bank, index) => (
                            <option key={index} value={bank} />
                          ))}
                        </datalist>
                      </InputGroup>
                    </Form.Group>
                  </Col>
                  
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        <BiUser className="me-1" />
                        Analista
                      </Form.Label>
                      <InputGroup>
                        <InputGroup.Text>
                          <BiSearch />
                        </InputGroup.Text>
                        <FormControl
                          placeholder="Buscar analista..."
                          value={analistaFilter}
                          onChange={(e) => setAnalistaFilter(e.target.value)}
                          list="analistaSuggestions"
                        />
                        <datalist id="analistaSuggestions">
                          {uniqueAnalistas.map((analista, index) => (
                            <option key={index} value={analista} />
                          ))}
                        </datalist>
                      </InputGroup>
                    </Form.Group>
                  </Col>
                  
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        <BiCalendar className="me-1" />
                        Fecha Desde
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={dateFromFilter}
                        onChange={(e) => setDateFromFilter(e.target.value)}
                        max={dateToFilter || undefined}
                      />
                    </Form.Group>
                  </Col>
                  
                  <Col md={3}>
                    <Form.Group className="mb-3">
                      <Form.Label>
                        <BiCalendar className="me-1" />
                        Fecha Hasta
                      </Form.Label>
                      <Form.Control
                        type="date"
                        value={dateToFilter}
                        onChange={(e) => setDateToFilter(e.target.value)}
                        min={dateFromFilter || undefined}
                      />
                    </Form.Group>
                  </Col>
                </Row>
                
                <Row>
                  <Col md={8}>
                    <div className="d-flex align-items-end h-100">
                      <div className="text-muted">
                        Mostrando {filteredData.length} de {creditData.length} registros
                        <span className="ms-2">
                          | {Object.keys(groupedByBank).length} bancos
                        </span>
                      </div>
                    </div>
                  </Col>
                  
                  <Col md={4}>
                    <div className="text-end">
                      <small className="text-muted">
                        Total Monto: <strong>${formatCurrency(totalMonto)}</strong>
                      </small>
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Total General */}
        <Row className="mb-4">
          <Col>
            <Card className="border-primary">
              <Card.Body className="text-center">
                <h5 className="card-title">
                  <BiDollar className="me-2" />
                  Total General de Créditos
                </h5>
                <h1 className="display-4 text-primary">
                  ${formatCurrency(totalMonto)}
                </h1>
                <p className="text-muted mb-0">
                  Suma total de todos los montos {dateFromFilter || dateToFilter ? 'filtrados' : ''}
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Tablas por Banco */}
        <div ref={tableRef}>
          {Object.keys(groupedByBank).length === 0 ? (
            <Row>
              <Col>
                <Card>
                  <Card.Body className="text-center py-5">
                    <h4>No hay datos disponibles</h4>
                    <p className="text-muted">
                      No se encontraron registros con los filtros aplicados
                    </p>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          ) : (
            Object.entries(groupedByBank).map(([bankName, bankData]) => {
              const bankTotal = calculateBankTotal(bankData)
              
              return (
                <Row key={bankName} className="mb-4">
                  <Col>
                    <Card>
                      <Card.Header className="bg-primary text-white">
                        <div className="d-flex justify-content-between align-items-center">
                          <h5 className="mb-0">
                            <BiBuilding className="me-2" />
                            {bankName}
                          </h5>
                          <div className="d-flex align-items-center">
                            <span className="me-3">
                              Total: <strong>${formatCurrency(bankTotal)}</strong>
                            </span>
                            <span className="badge bg-light text-dark">
                              {bankData.length} registros
                            </span>
                          </div>
                        </div>
                      </Card.Header>
                      <Card.Body className="p-0">
                        <div className="table-responsive" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                          <Table striped hover className="mb-0">
                            <thead style={{ position: 'sticky', top: 0, backgroundColor: 'white', zIndex: 1 }}>
                              <tr>
                                <th>Fecha</th>
                                <th>Tipo</th>
                                <th>N° Préstamo</th>
                                <th>Cliente</th>
                                <th>Analista</th>
                                <th>Descripción</th>
                                <th>Moneda</th>
                                <th className="text-end">Monto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bankData.map((credit, index) => (
                                <tr key={`${bankName}-${index}`}>
                                  <td>{formatDate(credit.fecha)}</td>
                                  <td>
                                    <span className={`badge ${credit.tipo === 'Ingreso' ? 'bg-success' : credit.tipo === 'Egreso' ? 'bg-danger' : 'bg-info'}`}>
                                      {credit.tipo}
                                    </span>
                                  </td>
                                  <td>
                                    <span className="badge bg-secondary">
                                      {credit.prestamo}
                                    </span>
                                  </td>
                                  <td>{credit.cliente}</td>
                                  <td>{credit.analista}</td>
                                  <td style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {credit.descripcion}
                                  </td>
                                  <td>{credit.moneda}</td>
                                  <td className="text-end">
                                    <strong className={credit.monto < 0 ? 'text-danger' : 'text-success'}>
                                      ${formatCurrency(credit.monto)}
                                    </strong>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="table-primary">
                                <td colSpan={7} className="text-end">
                                  <strong>Total {bankName}:</strong>
                                </td>
                                <td className="text-end">
                                  <strong>${formatCurrency(bankTotal)}</strong>
                                </td>
                              </tr>
                            </tfoot>
                          </Table>
                        </div>
                      </Card.Body>
                    </Card>
                  </Col>
                </Row>
              )
            })
          )}
        </div>

        {/* Resumen por Banco */}
        {Object.keys(groupedByBank).length > 0 && (
          <Row className="mt-4">
            <Col>
              <Card>
                <Card.Header>
                  <h5 className="mb-0">Resumen por Banco</h5>
                </Card.Header>
                <Card.Body>
                  <Row>
                    {Object.entries(groupedByBank).map(([bankName, bankData]) => {
                      const bankTotal = calculateBankTotal(bankData)
                      const percentage = totalMonto !== 0 ? (bankTotal / totalMonto) * 100 : 0
                      
                      return (
                        <Col md={4} className="mb-3" key={`summary-${bankName}`}>
                          <Card className="h-100">
                            <Card.Body>
                              <div className="d-flex justify-content-between align-items-center mb-2">
                                <h6 className="mb-0">{bankName}</h6>
                                <span className="badge bg-primary">
                                  {bankData.length} reg.
                                </span>
                              </div>
                              <h4 className="text-primary">
                                ${formatCurrency(bankTotal)}
                              </h4>
                              <div className="progress mb-2">
                                <div 
                                  className="progress-bar bg-success" 
                                  role="progressbar" 
                                  style={{ width: `${percentage}%` }}
                                  aria-valuenow={percentage} 
                                  aria-valuemin={0} 
                                  aria-valuemax={100}
                                >
                                  {percentage.toFixed(1)}%
                                </div>
                              </div>
                              <small className="text-muted">
                                {percentage.toFixed(1)}% del total general
                              </small>
                            </Card.Body>
                          </Card>
                        </Col>
                      )
                    })}
                  </Row>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        )}
      </Container>
    </AuthGuard>
  )

  // Funciones de exportación
  function exportToExcel() {
    const excelData: any[] = []
    
    Object.entries(groupedByBank).forEach(([bankName, bankData]) => {
      // Agregar encabezado del banco
      excelData.push({
        'Fecha': `BANCO: ${bankName}`,
        'Tipo': '',
        'N° Préstamo': '',
        'Cliente': '',
        'Analista': '',
        'Descripción': '',
        'Moneda': '',
        'Monto': ''
      })
      
      // Agregar datos del banco
      bankData.forEach(credit => {
        excelData.push({
          'Fecha': formatDate(credit.fecha),
          'Tipo': credit.tipo,
          'N° Préstamo': credit.prestamo,
          'Cliente': credit.cliente,
          'Analista': credit.analista,
          'Descripción': credit.descripcion,
          'Moneda': credit.moneda,
          'Monto': credit.monto
        })
      })
      
      // Agregar total del banco
      const bankTotal = calculateBankTotal(bankData)
      excelData.push({
        'Fecha': `TOTAL ${bankName}`,
        'Tipo': '',
        'N° Préstamo': '',
        'Cliente': '',
        'Analista': '',
        'Descripción': '',
        'Moneda': '',
        'Monto': bankTotal
      })
      
      // Agregar fila vacía para separación
      excelData.push({})
    })
    
    // Agregar total general
    excelData.push({
      'Fecha': 'TOTAL GENERAL',
      'Tipo': '',
      'N° Préstamo': '',
      'Cliente': '',
      'Analista': '',
      'Descripción': '',
      'Moneda': '',
      'Monto': totalMonto
    })

    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(excelData)
    
    const colWidths = [
      { wch: 20 }, // Fecha
      { wch: 10 }, // Tipo
      { wch: 15 }, // N° Préstamo
      { wch: 30 }, // Cliente
      { wch: 20 }, // Analista
      { wch: 50 }, // Descripción
      { wch: 8 },  // Moneda
      { wch: 15 }  // Monto
    ]
    worksheet['!cols'] = colWidths

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Créditos por Banco')
    XLSX.writeFile(workbook, `reporte_creditos_por_banco_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  function exportToPDF() {
    try {
      const doc = new jsPDF('landscape')
      
      // Título
      doc.setFontSize(16)
      doc.text('Reporte de Créditos por Banco', 14, 15)
      
      // Fecha de generación
      doc.setFontSize(10)
      doc.text(`Generado el: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22)
      
      // Filtros aplicados
      let yPos = 30
      const filters: string[] = []
      if (bancoFilter) filters.push(`Banco: ${bancoFilter}`)
      if (analistaFilter) filters.push(`Analista: ${analistaFilter}`)
      if (dateFromFilter || dateToFilter) {
        filters.push(`Fecha: ${dateFromFilter || 'Inicio'} a ${dateToFilter || 'Fin'}`)
      }
      if (filters.length > 0) {
        doc.setFontSize(10)
        doc.text(`Filtros aplicados: ${filters.join(', ')}`, 14, yPos)
        yPos += 8
      }
      
      // Total general
      doc.setFontSize(11)
      doc.text(`Total General: $${formatCurrency(totalMonto)}`, 14, yPos)
      yPos += 10
      
      // Recorrer bancos
      Object.entries(groupedByBank).forEach(([bankName, bankData], index) => {
        if (index > 0) {
          doc.addPage()
          yPos = 20
        }
        
        // Título del banco
        doc.setFontSize(14)
        doc.text(`BANCO: ${bankName}`, 14, yPos)
        yPos += 8
        
        // Total del banco
        const bankTotal = calculateBankTotal(bankData)
        doc.setFontSize(11)
        doc.text(`Total ${bankName}: $${formatCurrency(bankTotal)}`, 14, yPos)
        yPos += 10
        
        // Cabeceras
        const headers = [['Fecha', 'Tipo', 'N° Préstamo', 'Cliente', 'Analista', 'Descripción', 'Moneda', 'Monto']]
        const data = bankData.map(credit => [
          formatDate(credit.fecha),
          credit.tipo,
          credit.prestamo,
          credit.cliente,
          credit.analista,
          credit.descripcion,
          credit.moneda,
          `$${formatCurrency(credit.monto)}`
        ])
        
        // Fila de total del banco
        data.push([`TOTAL ${bankName}`, '', '', '', '', '', '', `$${formatCurrency(bankTotal)}`])
        
        // Configurar tabla
        ;(doc as any).autoTable({
          startY: yPos,
          head: headers,
          body: data,
          theme: 'grid',
          headStyles: { fillColor: [41, 128, 185], textColor: 255, fontSize: 8 },
          bodyStyles: { fontSize: 7 },
          alternateRowStyles: { fillColor: [245, 245, 245] },
          margin: { left: 14, right: 14 },
          styles: { overflow: 'linebreak', cellWidth: 'wrap' },
          columnStyles: {
            0: { cellWidth: 25 }, // Fecha
            1: { cellWidth: 15 }, // Tipo
            2: { cellWidth: 20 }, // N° Préstamo
            3: { cellWidth: 30 }, // Cliente
            4: { cellWidth: 20 }, // Analista
            5: { cellWidth: 40 }, // Descripción
            6: { cellWidth: 12 }, // Moneda
            7: { cellWidth: 18 }  // Monto
          }
        })
        
        yPos = (doc as any).lastAutoTable.finalY + 10
      })
      
      // Página de resumen si hay más de un banco
      if (Object.keys(groupedByBank).length > 1) {
        doc.addPage()
        doc.setFontSize(16)
        doc.text('RESUMEN GENERAL', 14, 20)
        doc.setFontSize(12)
        doc.text(`Total General Consolidado: $${formatCurrency(totalMonto)}`, 14, 30)
      }
      
      // Pie de página
      const pageCount = (doc as any).internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.text(`Página ${i} de ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10)
      }
      
      doc.save(`reporte_creditos_por_banco_${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (error) {
      console.error('Error al generar PDF:', error)
      alert('Error al generar el PDF. Por favor, intente exportar en otro formato.')
    }
  }
}