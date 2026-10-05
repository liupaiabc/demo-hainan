import { useEffect, useRef, useState } from 'react';
import { Alert, App as AntdApp, Button, Form, Input, Modal, Select, Spin, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { useNavigate } from 'react-router';
import type { LedgerFields, TemplateRecord } from '../../../shared/api.js';
import { api } from '../api';
import { Icon } from '../components/Icon';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const riskLevels = ['高', '中', '低'];
const resolvedOptions = ['是', '否', '无风险项'];

type GeneratedReport = {
  blob: Blob;
  evaluationForm: File;
  template: TemplateRecord;
};

function errorText(error: unknown) {
  if (error instanceof TypeError) return '无法连接到服务，请检查后端和数据库是否已启动';
  return error instanceof Error ? error.message : '操作失败，请重试';
}

export default function ReportPage() {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [templateError, setTemplateError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [templateId, setTemplateId] = useState<number | undefined>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedReport | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [form] = Form.useForm<LedgerFields>();
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    api.listTemplates().then((items) => {
      if (!active) return;
      setTemplates(items);
      setTemplateError('');
    }).catch((error: unknown) => {
      if (active) setTemplateError(errorText(error));
    }).finally(() => {
      if (active) setLoadingTemplates(false);
    });
    return () => { active = false; };
  }, [reloadKey]);

  useEffect(() => {
    const host = previewRef.current;
    if (!generated || !host) return;
    let active = true;
    host.replaceChildren();
    setPreviewLoading(true);
    setPreviewError('');
    void import('docx-preview').then(({ renderAsync }) => {
      if (!active) return;
      return renderAsync(generated.blob, host, undefined, {
        breakPages: true,
        inWrapper: false,
        renderAltChunks: false,
      });
    }).then(() => {
      if (active) setPreviewLoading(false);
    }).catch((error: unknown) => {
      if (active) {
        setPreviewError(`预览失败：${errorText(error)}。您仍可下载报告查看。`);
        setPreviewLoading(false);
      }
    });
    return () => { active = false; host.replaceChildren(); };
  }, [generated]);

  const evaluationForm = fileList[0]?.originFileObj ?? null;
  const selectedTemplate = templates.find((item) => item.id === templateId);

  function clearGenerated() {
    setGenerated(null);
    setPreviewError('');
  }

  async function generateReport() {
    if (!selectedTemplate) {
      message.warning('请先选择报告模板');
      return;
    }
    if (!evaluationForm) {
      message.warning('请先上传 .xlsx 或 .xlsm 评估表');
      return;
    }
    clearGenerated();
    setGenerating(true);
    try {
      const blob = await api.generateReport(selectedTemplate.id, evaluationForm);
      setGenerated({ blob, evaluationForm, template: selectedTemplate });
      setReportTitle(`${selectedTemplate.name}-${selectedTemplate.version}`);
      message.success('报告已生成，可预览或发布');
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setGenerating(false);
    }
  }

  function downloadReport() {
    if (!generated) return;
    const name = (reportTitle.trim() || '评估报告').replace(/[\\/:*?"<>|]/g, '_');
    const url = URL.createObjectURL(generated.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.docx`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function publishReport() {
    if (!generated) return;
    let values: LedgerFields;
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
    const reportName = `${(reportTitle.trim() || '评估报告').replace(/[\\/:*?"<>|]/g, '_')}.docx`;
    const reportFile = new File([generated.blob], reportName, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    setPublishing(true);
    try {
      await api.createLedger(fields, {
        evaluationForm: generated.evaluationForm,
        evaluationReport: reportFile,
      });
      message.success('报告已发布到评估台账');
      setPublishOpen(false);
      navigate('/ledger');
    } catch (error) {
      message.error(errorText(error));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="page-wrap">
      <div className="breadcrumb">首页 <span>/</span> 报告生成</div>
      <section className="page-card report-card">
        <h1 className="report-title">报告生成</h1>
        {templateError && <Alert className="load-error" type="error" showIcon message={`模板加载失败：${templateError}`} action={<Button size="small" onClick={() => { setLoadingTemplates(true); setReloadKey((key) => key + 1); }}>重试</Button>} />}
        <div className="report-input-grid">
          <section className="report-input-panel">
            <h2><Icon name="template" size={22} />当前启用模板</h2>
            <div className="report-panel-body">
              <div className="report-input-icon"><Icon name="file" size={27} /></div>
              <div className="report-template-control">
                <Select
                  aria-label="选择报告模板"
                  showSearch
                  optionFilterProp="label"
                  loading={loadingTemplates}
                  disabled={generating}
                  placeholder="请选择已上传的报告模板"
                  value={templateId}
                  options={templates.map((item) => ({ value: item.id, label: `${item.name} ${item.version}` }))}
                  onChange={(id) => { setTemplateId(id); clearGenerated(); }}
                  notFoundContent={loadingTemplates ? <Spin size="small" /> : '暂无模板，请先到报告模板管理上传'}
                />
                <p>{selectedTemplate ? `已选择：${selectedTemplate.name} ${selectedTemplate.version}` : '从报告模板管理中选择一个 DOCX 模板'}</p>
              </div>
            </div>
          </section>
          <section className="report-input-panel">
            <h2><Icon name="upload" size={22} />上传评估表</h2>
            <div className="report-panel-body report-upload-body">
              <Upload.Dragger
                className="report-upload"
                accept=".xlsx,.xlsm"
                maxCount={1}
                disabled={generating}
                fileList={fileList}
                beforeUpload={(file) => {
                  if (!/\.(xlsx|xlsm)$/i.test(file.name) || file.size === 0 || file.size > MAX_FILE_SIZE) {
                    message.error('仅支持 10 MB 以内的非空 .xlsx 或 .xlsm 文件');
                    return Upload.LIST_IGNORE;
                  }
                  return false;
                }}
                onChange={({ fileList: files }) => { setFileList(files); clearGenerated(); }}
                onRemove={() => { setFileList([]); clearGenerated(); }}
              >
                <Icon name="upload" size={29} />
                <span>点击或拖拽上传评估表</span>
                <small>支持 .xlsx、.xlsm 格式，最大 10 MB</small>
              </Upload.Dragger>
              <Button type="primary" className="report-generate-button" loading={generating} onClick={() => void generateReport()}>生成报告</Button>
            </div>
          </section>
        </div>

        <section className="report-preview-section">
          <div className="report-preview-heading">
            <h2>报告预览</h2>
            {generated && <span className="report-generated-tag">已根据评估表生成</span>}
          </div>
          {generated ? <>
            <div className="report-preview-layout">
              <div className="report-preview-canvas">
                {previewLoading && <div className="report-preview-status"><Spin tip="正在加载 DOCX 预览" size="large"><div /></Spin></div>}
                {previewError && <Alert type="warning" showIcon message={previewError} />}
                <div ref={previewRef} className="report-document" aria-label="生成的 DOCX 报告预览" />
              </div>
              <aside className="report-details">
                <h3>报告信息</h3>
                <label htmlFor="report-file-title">报告标题</label>
                <Input id="report-file-title" value={reportTitle} maxLength={240} onChange={(event) => setReportTitle(event.target.value)} />
                <p className="report-field-hint">用于下载文件名和发布后的评估报告附件名</p>
                <dl>
                  <dt>报告模板</dt><dd>{generated.template.name} {generated.template.version}</dd>
                  <dt>评估表</dt><dd title={generated.evaluationForm.name}>{generated.evaluationForm.name}</dd>
                  <dt>生成状态</dt><dd>已生成</dd>
                </dl>
                <Alert type="info" showIcon message="预览效果可能与 Word 略有差异，请下载核对最终文档。" />
              </aside>
            </div>
            <div className="report-preview-actions">
              <Button icon={<Icon name="download" size={18} />} onClick={downloadReport}>下载报告</Button>
              <Button type="primary" icon={<Icon name="report" size={18} />} onClick={() => setPublishOpen(true)}>发布报告</Button>
            </div>
          </> : <div className="report-empty-preview">
            <Icon name="file" size={44} />
            <strong>尚未生成报告</strong>
            <span>选择模板并上传评估表后，点击“生成报告”查看 DOCX 预览</span>
          </div>}
        </section>
      </section>

      <Modal
        title="发布报告到评估台账"
        open={publishOpen}
        onCancel={() => { if (!publishing) { setPublishOpen(false); form.resetFields(); } }}
        onOk={() => void publishReport()}
        confirmLoading={publishing}
        cancelButtonProps={{ disabled: publishing }}
        closable={!publishing}
        maskClosable={!publishing}
        okText="确认发布"
        cancelText="取消"
        width={760}
        className="ledger-modal"
        destroyOnHidden
      >
        <p className="report-publish-note">评估表和生成的 DOCX 将分别保存到台账的“评估表”和“评估报告”列。</p>
        <Form form={form} layout="vertical" requiredMark={false} className="ledger-form">
          <div className="ledger-form-grid">
            <Form.Item label="业务名称" name="businessName" rules={[{ required: true, whitespace: true, message: '请输入业务名称' }]}>
              <Input maxLength={100} placeholder="请输入业务名称" />
            </Form.Item>
            <Form.Item label="需求名称" name="requirementName" rules={[{ required: true, whitespace: true, message: '请输入需求名称' }]}>
              <Input maxLength={100} placeholder="请输入需求名称" />
            </Form.Item>
            <Form.Item className="full-width" label="需求描述" name="description" rules={[{ required: true, whitespace: true, message: '请输入需求描述' }]}>
              <Input.TextArea rows={2} maxLength={500} placeholder="请输入需求描述" />
            </Form.Item>
            <Form.Item label="对接人" name="contact" rules={[{ required: true, whitespace: true, message: '请输入对接人' }]}>
              <Input maxLength={50} placeholder="请输入对接人" />
            </Form.Item>
            <Form.Item label="评估完成日期" name="completionDate" rules={[{ required: true, message: '请选择评估完成日期' }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item label="风险等级" name="riskLevel" rules={[{ required: true, message: '请选择风险等级' }]}>
              <Select placeholder="请选择" options={riskLevels.map((value) => ({ value, label: value }))} />
            </Form.Item>
            <Form.Item label="风险项个数" name="riskCount" rules={[{ required: true, whitespace: true, message: '请输入风险项个数' }]}>
              <Input maxLength={20} placeholder="例如 3" />
            </Form.Item>
            <Form.Item className="full-width" label="风险是否处置完成" name="riskResolved" rules={[{ required: true, message: '请选择处置状态' }]}>
              <Select placeholder="请选择" options={resolvedOptions.map((value) => ({ value, label: value }))} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
