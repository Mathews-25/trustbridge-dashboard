import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DisputePanel from '../DisputePanel';

const mockInvalidateQueries = vi.fn();
const mockMutate = vi.fn();

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>(
    '@tanstack/react-query',
  );
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
    useMutation: (options: any) => ({
      mutate: mockMutate,
      isLoading: false,
      isError: false,
      error: null,
      ...options,
    }),
  };
});

const contributors = [
  { id: '1', username: 'alice' },
  { id: '2', username: 'bob' },
];

function renderPanel(props: Record<string, unknown> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DisputePanel contributors={contributors} {...props} />
    </QueryClientProvider>,
  );
}

describe('DisputePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders contributor select options', () => {
    renderPanel();
    const select = screen.getByLabelText(/contributor/i);
    expect(select).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'alice' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'bob' })).toBeInTheDocument();
  });

  it('renders the empty list state when there are no contributors', () => {
    renderPanel({ contributors: [] });
    expect(screen.getByText(/no contributors/i)).toBeInTheDocument();
  });

  it('clears the reason and invalidates the query on successful submit', async () => {
    const user = userEvent.setup();
    mockMutate.mockImplementation((_vars: unknown, opts: any) => {
      opts?.onSuccess?.();
    });

    renderPanel();

    await user.selectOptions(screen.getByLabelText(/contributor/i), '1');
    const reason = screen.getByLabelText(/reason/i);
    await user.type(reason, 'Payment was never received');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    await waitFor(() => expect(reason).toHaveValue(''));
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('surfaces mutation errors accessibly', async () => {
    const user = userEvent.setup();
    mockMutate.mockImplementation((_vars: unknown, opts: any) => {
      opts?.onError?.(new Error('Failed to file dispute'));
    });

    renderPanel();

    await user.selectOptions(screen.getByLabelText(/contributor/i), '1');
    await user.type(screen.getByLabelText(/reason/i), 'Something went wrong');
    await user.click(screen.getByRole('button', { name: /submit/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/failed to file dispute/i);
  });
});
