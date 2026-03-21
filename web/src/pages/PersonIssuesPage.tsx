import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { IssuesList, DEFAULT_FILTER_TABS } from '@/components/IssuesList';
import { apiGet } from '@/lib/api';

interface PersonDocument {
  id: string;
  title: string;
  document_type: string;
  properties?: {
    user_id?: string | null;
    [key: string]: unknown;
  };
}

export function PersonIssuesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<PersonDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPerson() {
      if (!id) return;
      try {
        const response = await apiGet(`/api/documents/${id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.document_type === 'person') {
            setPerson(data);
          } else {
            navigate('/team/directory');
          }
        } else {
          navigate('/team/directory');
        }
      } catch {
        navigate('/team/directory');
      } finally {
        setLoading(false);
      }
    }
    fetchPerson();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  if (!person || !id) return null;

  const userId = person.properties?.user_id;
  if (!userId) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <p className="text-sm text-muted">This person has no linked user account.</p>
        <Link to={`/team/${id}`} className="mt-2 text-sm text-accent hover:underline">
          Back to profile
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Link
          to={`/team/${id}`}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          &larr; {person.title}
        </Link>
        <span className="text-sm text-muted">/</span>
        <h1 className="text-sm font-medium text-foreground">Assigned Issues</h1>
      </div>

      <div className="flex-1 overflow-hidden">
        <IssuesList
          lockedAssigneeId={userId}
          filterTabs={DEFAULT_FILTER_TABS}
          storageKeyPrefix={`person-issues-${id}`}
          showProgramFilter={true}
          showProjectFilter={true}
          showSprintFilter={true}
          showCreateButton={false}
          enableKeyboardNavigation={true}
          defaultColumns={['title', 'status', 'priority', 'program', 'sprint', 'updated']}
        />
      </div>
    </div>
  );
}
