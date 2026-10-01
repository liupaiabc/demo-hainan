import { Button, Result } from 'antd';
import { Link } from 'react-router';

export default function NotFoundPage() {
  return <Result status="404" title="Page not found" extra={<Link to="/"><Button type="primary">Go home</Button></Link>} />;
}
