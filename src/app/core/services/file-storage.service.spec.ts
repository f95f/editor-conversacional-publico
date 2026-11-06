import { FileStorageService } from './file-storage.service';

describe('FileStorageService', () => {
  let service: FileStorageService;

  beforeEach(() => {
    service = new FileStorageService();
  });

  it('reads a chosen flow file and removes its temporary input', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      const pending = service.openJsonFile();
      const input = document.querySelector<HTMLInputElement>('input[type="file"]');
      expect(input).not.toBeNull();
      const file = new File(['{"schemaVersion":1}'], 'test.flow.json', { type: 'application/json' });
      Object.defineProperty(input!, 'files', { value: [file] });
      input!.dispatchEvent(new Event('change'));

      expect(await pending).toEqual({
        status: 'completed',
        value: { name: 'test.flow.json', text: '{"schemaVersion":1}' },
      });
      expect(document.querySelector('input[type="file"]')).toBeNull();
    } finally {
      click.mockRestore();
    }
  });

  it('removes its temporary input when opening is cancelled', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    try {
      const pending = service.openJsonFile();
      document.querySelector<HTMLInputElement>('input[type="file"]')!.dispatchEvent(new Event('cancel'));
      expect(await pending).toEqual({ status: 'cancelled' });
      expect(document.querySelector('input[type="file"]')).toBeNull();
    } finally {
      click.mockRestore();
    }
  });
});
