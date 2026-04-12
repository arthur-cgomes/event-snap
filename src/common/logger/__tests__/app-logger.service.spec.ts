import { Test, TestingModule } from '@nestjs/testing';
import { AppLoggerService } from '../app-logger.service';

describe('AppLoggerService', () => {
  let service: AppLoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppLoggerService],
    }).compile();

    service = module.get<AppLoggerService>(AppLoggerService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('Should log message', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      service.log('Test message', 'TestContext');

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain('info');
      expect(callArg).toContain('Test message');

      consoleSpy.mockRestore();
    });

    it('Should log message without context', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      service.log('Test message');

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain('Application');

      consoleSpy.mockRestore();
    });

    it('Should log object message', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      service.log({ key: 'value' }, 'TestContext');

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain('key');

      consoleSpy.mockRestore();
    });
  });

  describe('error', () => {
    it('Should log error message', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.error('Error message', 'Stack trace', 'ErrorContext');

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain('error');
      expect(callArg).toContain('Error message');

      consoleSpy.mockRestore();
    });

    it('Should log error without trace', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.error('Error message');

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('warn', () => {
    it('Should log warning message', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      service.warn('Warning message', 'WarnContext');

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain('warn');
      expect(callArg).toContain('Warning message');

      consoleSpy.mockRestore();
    });
  });

  describe('debug', () => {
    it('Should log debug message in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();

      service.debug('Debug message', 'DebugContext');

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain('debug');

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('Should not log debug message in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();

      service.debug('Debug message', 'DebugContext');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('verbose', () => {
    it('Should log verbose message in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      service.verbose('Verbose message', 'VerboseContext');

      expect(consoleSpy).toHaveBeenCalled();
      const callArg = consoleSpy.mock.calls[0][0];
      expect(callArg).toContain('verbose');

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('Should not log verbose message in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      service.verbose('Verbose message', 'VerboseContext');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('setLogLevels', () => {
    it('Should have setLogLevels method', () => {
      expect(service.setLogLevels).toBeDefined();
    });

    it('Should call setLogLevels without throwing', () => {
      const result = service.setLogLevels(['log', 'warn']);
      expect(result).toBeUndefined();
    });
  });
});
