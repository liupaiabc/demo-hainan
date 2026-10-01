import { useEffect, useMemo, useState } from 'react';
import { Alert, App as AntdApp, Button, Form, Input, Modal, Table, Upload } from 'antd';
import type { TableProps, UploadFile } from 'antd';
import type { TemplateRecord } from '../../../shared/api.js';
import { api } from '../api';
import { Icon } from '../components/Icon';

type TemplateForm = {
  name: string;
  version: string;
  attachment: UploadFile[];
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function errorText(error: unknown) {
  if (error instanceof TypeError) return '无法连接到服务，请检查后端和数据库是否已启动';
  return error instanceof Error ? error.message : '操作失败，请重试';
}

function formatDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function HomePage() {
  const { message, modal } = AntdApp.useApp();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<TemplateForm>();

  useEffect(() => {
    let active = true;
    api.listTemplates().then((records) => {
      if (active) {
        setTemplates(records);
        setLoadError('');
      }
    }).catch((error: unknown) => {
      if (active) setLoadError(errorText(error));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  const visibleTemplates = useMemo(() => templates.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase())), [templates, query]);

  function openUpload() {
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(template: TemplateRecord) {
    setEditingId(template.id);
    form.setFieldsValue({ name: template.name, version: template.version, attachment: [] });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    form.resetFields();
  }

  async function saveTemplate() {
    let values: TemplateForm;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const selected = values.attachment?.[0];
    const file = selected?.originFileObj ?? (selected instanceof File ? selected : undefined);
    if (editingId === null && !file) {
      message.error('请重新选择 .docx 文件');
      return;
    }
    setSaving(true);
    try {
      if (editingId !== null) {
        const updated = await api.updateTemplate(editingId, values.name.trim(), values.version.trim(), file);
        setTemplates((current) => current.map((item) => item.id === editingId ? updated : item));
        message.success('模板信息已更新');
      } else {
        const created = await api.createTemplate(values.name.trim(), values.version.trim(), file!);
        setTemplates((current) => [created, ...current]);
        message.success('模板上传成功');
      }
      closeModal();
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setSaving(false);
    }
  }

  async function downloadTemplate(template: TemplateRecord) {
    try {
      const blob = await api.downloadTemplate(template.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${template.name}-${template.version}.docx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      message.error(errorText(error));
    }
  }

  const columns: TableProps<TemplateRecord>['columns'] = [
    {
      title: '模板名称', dataIndex: 'name', key: 'name',
      render: (name: string) => <span className="template-name"><span className="folder-icon" aria-hidden="true" />{name}</span>,
    },
    { title: '版本号', dataIndex: 'version', key: 'version', align: 'center', width: 190 },
    { title: '上传时间', dataIndex: 'uploadedAt', key: 'uploadedAt', align: 'center', width: 260, render: (value: string) => formatDate(value) },
    {
      title: '操作', key: 'actions', align: 'center', width: 300,
      render: (_, record) => <div className="table-actions">
        <button type="button" onClick={() => openEdit(record)}><Icon name="edit" size={18} />编辑</button>
        <button type="button" onClick={() => downloadTemplate(record)}><Icon name="download" size={18} />下载</button>
        <button type="button" onClick={() => modal.confirm({
          title: '删除报告模板',
          content: `确定删除“${record.name}”吗？`,
          okText: '删除', cancelText: '取消', okButtonProps: { danger: true },
          onOk: async () => {
            try {
              await api.deleteTemplate(record.id);
              setTemplates((current) => current.filter((item) => item.id !== record.id));
              message.success('模板已删除');
            } catch (error) {
              message.error(errorText(error));
              throw error;
            }
          },
        })}><Icon name="delete" size={18} />删除</button>
      </div>,
    },
  ];

  return (
    <div className="page-wrap">
      <div className="breadcrumb">首页 <span>/</span> 报告模板管理</div>
      <section className="page-card">
        <div className="page-toolbar">
          <h1>报告模板管理</h1>
          <div className="toolbar-actions">
            <Button type="primary" className="upload-button" icon={<Icon name="upload" size={19} />} onClick={openUpload}>上传报告模板</Button>
            <Input className="template-search" prefix={<Icon name="search" size={19} />} placeholder="搜索模板名称" value={query} onChange={(event) => setQuery(event.target.value)} allowClear aria-label="搜索模板名称" />
          </div>
        </div>
        {loadError && <Alert className="load-error" type="error" showIcon message={`模板加载失败：${loadError}`} action={<Button size="small" onClick={() => { setLoading(true); setReloadKey((key) => key + 1); }}>重试</Button>} />}
        <Table<TemplateRecord> className="template-table" rowKey="id" columns={columns} dataSource={visibleTemplates} loading={loading} pagination={false} locale={{ emptyText: loadError ? '暂时无法加载模板' : '暂无报告模板' }} scroll={{ x: 850 }} />
      </section>

      <Modal
        title={<span className="modal-heading"><Icon name="upload" size={22} />{editingId !== null ? '编辑报告模板' : '上传报告模板'}</span>}
        open={modalOpen}
        onCancel={closeModal}
        onOk={saveTemplate}
        confirmLoading={saving}
        cancelButtonProps={{ disabled: saving }}
        closable={!saving}
        maskClosable={!saving}
        okText="确认"
        cancelText="取消"
        width={640}
        className="template-modal"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} className="template-form">
          <Form.Item label="模板名称" name="name" rules={[{ required: true, whitespace: true, message: '请输入模板名称' }]}>
            <Input placeholder="请输入模板名称" maxLength={100} />
          </Form.Item>
          <Form.Item label="版本号" name="version" rules={[{ required: true, whitespace: true, message: '请输入版本号' }]}>
            <Input placeholder="例如 v1.0" maxLength={30} />
          </Form.Item>
          <Form.Item
            label="附件上传"
            name="attachment"
            valuePropName="fileList"
            getValueFromEvent={(event: { fileList: UploadFile[] }) => event.fileList}
            rules={editingId !== null ? [] : [{ required: true, message: '请上传 .docx 文件' }]}
          >
            <Upload
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              maxCount={1}
              beforeUpload={(file) => {
                if (!file.name.toLowerCase().endsWith('.docx')) {
                  message.error('仅支持 .docx 格式文件');
                  return Upload.LIST_IGNORE;
                }
                if (file.size === 0 || file.size > MAX_FILE_SIZE) {
                  message.error('文件须大于 0 且不能超过 10 MB');
                  return Upload.LIST_IGNORE;
                }
                return false;
              }}
            >
              <Button icon={<Icon name="file" size={17} />}>选择 .docx 文件</Button>
            </Upload>
          </Form.Item>
          <p className="upload-hint">仅支持 10 MB 以内的 .docx 文件{editingId !== null ? '，不选择文件将保留原附件' : ''}</p>
        </Form>
      </Modal>
    </div>
  );
}
