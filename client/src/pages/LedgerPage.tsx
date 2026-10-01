import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntdApp, Button, Form, Input, Modal, Select, Table, Upload } from 'antd';
import type { TableProps, UploadFile } from 'antd';
import type { LedgerDocumentKey, LedgerFields, LedgerRecord } from '../../../shared/api.js';
import { api } from '../api';
import { Icon } from '../components/Icon';

type LedgerFormValues = LedgerFields & Partial<Record<LedgerDocumentKey, UploadFile[]>>;
type Filters = Pick<LedgerFields, 'businessName' | 'requirementName' | 'riskLevel' | 'riskResolved'>;
type LedgerFileNameKey = 'evaluationFormFileName' | 'evaluationReportFileName' | 'riskTrackingSheetFileName';

const emptyFilters: Filters = { businessName: '', requirementName: '', riskLevel: '', riskResolved: '' };
type DocumentExtension = '.docx' | '.xlsx';
const documentFields: { key: LedgerDocumentKey; label: string; extension: DocumentExtension; fileNameKey: LedgerFileNameKey }[] = [
  { key: 'evaluationForm', label: '评估表', extension: '.xlsx', fileNameKey: 'evaluationFormFileName' },
  { key: 'evaluationReport', label: '评估报告', extension: '.docx', fileNameKey: 'evaluationReportFileName' },
  { key: 'riskTrackingSheet', label: '风险跟踪表', extension: '.xlsx', fileNameKey: 'riskTrackingSheetFileName' },
];
const riskLevels = ['高', '中', '低'];
const resolvedOptions = ['是', '否', '无风险项'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function errorText(error: unknown) {
  if (error instanceof TypeError) return '无法连接到服务，请检查后端和数据库是否已启动';
  return error instanceof Error ? error.message : '操作失败，请重试';
}

function selectedFile(files?: UploadFile[]): File | null {
  const selected = files?.[0];
  if (!selected) return null;
  return selected.originFileObj ?? (selected instanceof File ? selected : null);
}

export default function LedgerPage() {
  const { message, modal } = AntdApp.useApp();
  const [records, setRecords] = useState<LedgerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(emptyFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<LedgerFormValues>();

  useEffect(() => {
    let active = true;
    api.listLedger().then((items) => {
      if (active) { setRecords(items); setLoadError(''); }
    }).catch((error: unknown) => {
      if (active) setLoadError(errorText(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const editingRecord = records.find((record) => record.id === editingId);
  const visibleRecords = useMemo(() => records.filter((record) =>
    (!appliedFilters.businessName || record.businessName === appliedFilters.businessName)
    && (!appliedFilters.requirementName || record.requirementName === appliedFilters.requirementName)
    && (!appliedFilters.riskLevel || record.riskLevel === appliedFilters.riskLevel)
    && (!appliedFilters.riskResolved || record.riskResolved === appliedFilters.riskResolved),
  ), [records, appliedFilters]);

  const businessOptions = [...new Set(records.map((record) => record.businessName))].map((value) => ({ value, label: value }));
  const requirementOptions = [...new Set(records.map((record) => record.requirementName))].map((value) => ({ value, label: value }));

  function openCreate() {
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(record: LedgerRecord) {
    setEditingId(record.id);
    form.setFieldsValue({
      businessName: record.businessName,
      requirementName: record.requirementName,
      description: record.description,
      contact: record.contact,
      completionDate: record.completionDate,
      riskLevel: record.riskLevel,
      riskCount: record.riskCount,
      riskResolved: record.riskResolved,
      evaluationForm: [], evaluationReport: [], riskTrackingSheet: [],
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
  }

  async function saveRecord() {
    let values: LedgerFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const fields: LedgerFields = {
      businessName: values.businessName.trim(),
      requirementName: values.requirementName.trim(),
      description: values.description.trim(),
      contact: values.contact.trim(),
      completionDate: values.completionDate,
      riskLevel: values.riskLevel,
      riskCount: values.riskCount.trim(),
      riskResolved: values.riskResolved,
    };
    const files = {
      evaluationForm: selectedFile(values.evaluationForm),
      evaluationReport: selectedFile(values.evaluationReport),
      riskTrackingSheet: selectedFile(values.riskTrackingSheet),
    };

    setSaving(true);
    try {
      if (editingId !== null) {
        const updated = await api.updateLedger(editingId, fields, files);
        setRecords((current) => current.map((record) => record.id === editingId ? updated : record));
        message.success('记录已更新');
      } else {
        const created = await api.createLedger(fields, files);
        setRecords((current) => [created, ...current]);
        message.success('记录已新增');
      }
      closeModal();
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function downloadDocument(record: LedgerRecord, key: LedgerDocumentKey, fileName: string) {
    try {
      const blob = await api.downloadLedgerFile(record.id, key);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      message.error(errorText(error));
    }
  }

  async function replaceDocument(record: LedgerRecord, key: LedgerDocumentKey, file: File, extension: DocumentExtension) {
    if (!file.name.toLowerCase().endsWith(extension) || file.size === 0 || file.size > MAX_FILE_SIZE) {
      message.error(`仅支持 10 MB 以内的非空 ${extension} 文件`);
      return;
    }
    try {
      const updated = await api.replaceLedgerFile(record.id, key, file);
      setRecords((current) => current.map((item) => item.id === record.id ? updated : item));
      message.success('附件已更新');
    } catch (error) {
      message.error(errorText(error));
    }
  }

  function fileCell(record: LedgerRecord, key: LedgerDocumentKey, label: string, extension: DocumentExtension, fileNameKey: LedgerFileNameKey) {
    const fileName = record[fileNameKey];
    return <div className="ledger-file-cell">
      {fileName && <span className="ledger-file-name" title={fileName}>{fileName}</span>}
      <div className="ledger-icon-actions">
        <button type="button" disabled={!fileName} title={`下载${label}`} aria-label={`下载${label}`} onClick={() => { if (fileName) void downloadDocument(record, key, fileName); }}><Icon name="download" size={18} /></button>
        <Upload accept={extension} showUploadList={false} beforeUpload={(selected) => {
          void replaceDocument(record, key, selected, extension);
          return Upload.LIST_IGNORE;
        }}>
          <button type="button" title={`上传或替换${label}`} aria-label={`上传或替换${label}`}><Icon name="replace" size={18} /></button>
        </Upload>
      </div>
    </div>;
  }

  const columns: TableProps<LedgerRecord>['columns'] = [
    { title: '业务名称', dataIndex: 'businessName', key: 'businessName', width: 140 },
    { title: '需求名称', dataIndex: 'requirementName', key: 'requirementName', width: 160 },
    { title: '需求描述', dataIndex: 'description', key: 'description', width: 260, render: (value: string) => <span title={value}>{value}</span> },
    { title: '对接人', dataIndex: 'contact', key: 'contact', width: 110, align: 'center' },
    { title: '评估完成日期', dataIndex: 'completionDate', key: 'completionDate', width: 145, align: 'center' },
    { title: '风险等级', dataIndex: 'riskLevel', key: 'riskLevel', width: 110, align: 'center' },
    { title: '风险项个数', dataIndex: 'riskCount', key: 'riskCount', width: 120, align: 'center' },
    { title: '风险是否处置完成', dataIndex: 'riskResolved', key: 'riskResolved', width: 170, align: 'center' },
    ...documentFields.map(({ key, label, extension, fileNameKey }) => ({ title: label, key, width: 140, align: 'center' as const, render: (_: unknown, record: LedgerRecord) => fileCell(record, key, label, extension, fileNameKey) })),
    {
      title: '操作', key: 'actions', width: 150, align: 'center',
      render: (_, record) => <div className="table-actions ledger-row-actions">
        <button type="button" onClick={() => openEdit(record)}><Icon name="edit" size={17} />编辑</button>
        <button type="button" onClick={() => modal.confirm({
          title: '删除台账记录',
          content: `确定删除“${record.requirementName}”吗？`,
          okText: '删除', cancelText: '取消', okButtonProps: { danger: true },
          onOk: async () => {
            try {
              await api.deleteLedger(record.id);
              setRecords((current) => current.filter((item) => item.id !== record.id));
              message.success('记录已删除');
            } catch (error) {
              message.error(errorText(error));
              throw error;
            }
          },
        })}><Icon name="delete" size={17} />删除</button>
      </div>,
    },
  ];

  const filterSelect = (key: keyof Filters, label: string, options: { value: string; label: string }[]) => (
    <label className="ledger-filter-field" key={key}>
      <span>{label}</span>
      <Select
        aria-label={label}
        placeholder="全部"
        value={draftFilters[key] || undefined}
        options={options}
        allowClear
        onChange={(value) => setDraftFilters((current) => ({ ...current, [key]: value ?? '' }))}
      />
    </label>
  );

  return (
    <div className="page-wrap">
      <div className="breadcrumb">首页 <span>/</span> 评估台账</div>
      <section className="page-card ledger-card">
        <h1 className="ledger-title">评估台账</h1>
        <div className="ledger-body">
          {loadError && <Alert className="load-error" type="error" showIcon message={`台账加载失败：${loadError}`} action={<Button size="small" onClick={() => { setLoading(true); setReloadKey((key) => key + 1); }}>重试</Button>} />}
          <div className="ledger-filters">
            {filterSelect('businessName', '业务名称', businessOptions)}
            {filterSelect('requirementName', '需求名称', requirementOptions)}
            {filterSelect('riskLevel', '风险等级', riskLevels.map((value) => ({ value, label: value })))}
            {filterSelect('riskResolved', '风险是否处置完成', resolvedOptions.map((value) => ({ value, label: value })))}
            <div className="ledger-filter-actions">
              <Button type="primary" onClick={() => setAppliedFilters(draftFilters)}>查询</Button>
              <Button onClick={() => { setDraftFilters(emptyFilters); setAppliedFilters(emptyFilters); }}>重置</Button>
            </div>
          </div>
          <div className="ledger-toolbar">
            <Button type="primary" icon={<Icon name="plus" size={18} />} onClick={openCreate}>手动新增记录</Button>
            <Button icon={<Icon name="export" size={18} />} onClick={() => message.info('导出功能尚未实现')}>导出台账 Excel</Button>
          </div>
          <Table<LedgerRecord>
            className="ledger-table"
            rowKey="id"
            columns={columns}
            dataSource={visibleRecords}
            loading={loading}
            pagination={false}
            scroll={{ x: 1845 }}
            locale={{ emptyText: loadError ? '暂时无法加载台账' : '暂无符合条件的台账记录' }}
          />
        </div>
      </section>

      <Modal
        title={editingId ? '编辑台账记录' : '手动新增记录'}
        open={modalOpen}
        onCancel={closeModal}
        onOk={saveRecord}
        confirmLoading={saving}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        maskClosable={!saving}
        okText="确认"
        cancelText="取消"
        width={760}
        className="ledger-modal"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} className="ledger-form">
          <div className="ledger-form-grid">
            <Form.Item label="业务名称" name="businessName" rules={[{ required: true, whitespace: true, message: '请输入业务名称' }]}>
              <Input placeholder="请输入业务名称" maxLength={100} />
            </Form.Item>
            <Form.Item label="需求名称" name="requirementName" rules={[{ required: true, whitespace: true, message: '请输入需求名称' }]}>
              <Input placeholder="请输入需求名称" maxLength={100} />
            </Form.Item>
            <Form.Item className="full-width" label="需求描述" name="description" rules={[{ required: true, whitespace: true, message: '请输入需求描述' }]}>
              <Input.TextArea placeholder="请输入需求描述" rows={2} maxLength={500} />
            </Form.Item>
            <Form.Item label="对接人" name="contact" rules={[{ required: true, whitespace: true, message: '请输入对接人' }]}>
              <Input placeholder="请输入对接人" maxLength={50} />
            </Form.Item>
            <Form.Item label="评估完成日期" name="completionDate" rules={[{ required: true, message: '请选择评估完成日期' }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item label="风险等级" name="riskLevel" rules={[{ required: true, message: '请选择风险等级' }]}>
              <Select placeholder="请选择" options={riskLevels.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item label="风险项个数" name="riskCount" rules={[{ required: true, whitespace: true, message: '请输入风险项个数' }]}>
              <Input placeholder="例如 3" maxLength={20} />
            </Form.Item>
            <Form.Item className="full-width" label="风险是否处置完成" name="riskResolved" rules={[{ required: true, message: '请选择处置状态' }]}>
              <Select placeholder="请选择" options={resolvedOptions.map((value) => ({ value, label: value }))} />
            </Form.Item>
            {documentFields.map(({ key, label, extension, fileNameKey }) => <Form.Item
              key={key}
              className="full-width ledger-upload-field"
              label={label}
              name={key}
              valuePropName="fileList"
              getValueFromEvent={(event: { fileList: UploadFile[] }) => event.fileList}
              extra={editingRecord?.[fileNameKey] ? `当前文件：${editingRecord[fileNameKey]}（不选择则保留）` : undefined}
            >
              <Upload
                accept={extension}
                maxCount={1}
                beforeUpload={(file) => {
                  if (!file.name.toLowerCase().endsWith(extension) || file.size === 0 || file.size > MAX_FILE_SIZE) {
                    message.error(`仅支持 10 MB 以内的非空 ${extension} 文件`);
                    return Upload.LIST_IGNORE;
                  }
                  return false;
                }}
              >
                <Button icon={<Icon name="upload" size={16} />}>选择 {extension} 文件</Button>
              </Upload>
            </Form.Item>)}
          </div>
        </Form>
      </Modal>
    </div>
  );
}
