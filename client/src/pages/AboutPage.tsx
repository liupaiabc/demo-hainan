import { Card, Typography } from 'antd';

const { Title, Paragraph } = Typography;

export default function AboutPage() {
  return (
    <>
      <div className="intro">
        <Title>About this starter</Title>
        <Paragraph>This is a second page using React Router. Add more pages alongside it in <code>client/src/pages</code>.</Paragraph>
      </div>
      <Card className="card-stack">
        <Paragraph>The frontend uses React and Ant Design. Koa serves the JSON API, and Vite forwards development requests from <code>/api</code> to the server.</Paragraph>
      </Card>
    </>
  );
}
