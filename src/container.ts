import { WorkApiService } from "./services/work-api.service";
import { DiretrixService } from "./services/diretrix.service";
import { DBaseService } from "./services/dbase.service";
import { MimirService } from "./services/mimir.service";
import { C2SService } from "./services/c2s.service";
import { CpfDiscoveryService } from "./services/cpf-discovery.service";
import { EnrichmentService } from "./services/enrichment.service";
import { DbStorageService } from "./services/db-storage.service";
import { IbviPropertyService } from "./services/ibvi-property.service";
import { WebInsightService } from "./services/web-insight.service";
import { PrometheusService } from "./services/prometheus.service";
import { LeadAnalysisService } from "./services/lead-analysis.service";
import { CpfLookupService } from "./services/cpf-lookup.service";
import { BulkEnrichmentService } from "./services/bulk-enrichment.service";
import { ProfileReportService } from "./services/profile-report.service";
import { LeadQualityService } from "./services/lead-quality.service";

/**
 * Simple dependency injection container
 * Services are lazily instantiated on first access
 */
class ServiceContainer {
  private _workApi?: WorkApiService;
  private _diretrix?: DiretrixService;
  private _dbase?: DBaseService;
  private _mimir?: MimirService;
  private _c2s?: C2SService;
  private _cpfDiscovery?: CpfDiscoveryService;
  private _enrichment?: EnrichmentService;
  private _dbStorage?: DbStorageService;
  private _ibviProperty?: IbviPropertyService;
  private _webInsight?: WebInsightService;
  private _prometheus?: PrometheusService;
  private _leadAnalysis?: LeadAnalysisService;
  private _cpfLookup?: CpfLookupService;
  private _bulkEnrichment?: BulkEnrichmentService;
  private _profileReport?: ProfileReportService;
  private _leadQuality?: LeadQualityService;

  get workApi(): WorkApiService {
    if (!this._workApi) {
      this._workApi = new WorkApiService();
    }
    return this._workApi;
  }

  get diretrix(): DiretrixService {
    if (!this._diretrix) {
      this._diretrix = new DiretrixService();
    }
    return this._diretrix;
  }

  get dbase(): DBaseService {
    if (!this._dbase) {
      this._dbase = new DBaseService();
    }
    return this._dbase;
  }

  get mimir(): MimirService {
    if (!this._mimir) {
      this._mimir = new MimirService();
    }
    return this._mimir;
  }

  get c2s(): C2SService {
    if (!this._c2s) {
      this._c2s = new C2SService();
    }
    return this._c2s;
  }

  get cpfDiscovery(): CpfDiscoveryService {
    if (!this._cpfDiscovery) {
      this._cpfDiscovery = new CpfDiscoveryService();
    }
    return this._cpfDiscovery;
  }

  get enrichment(): EnrichmentService {
    if (!this._enrichment) {
      this._enrichment = new EnrichmentService();
    }
    return this._enrichment;
  }

  get dbStorage(): DbStorageService {
    if (!this._dbStorage) {
      this._dbStorage = new DbStorageService();
    }
    return this._dbStorage;
  }

  get ibviProperty(): IbviPropertyService {
    if (!this._ibviProperty) {
      this._ibviProperty = new IbviPropertyService();
    }
    return this._ibviProperty;
  }

  get webInsight(): WebInsightService {
    if (!this._webInsight) {
      this._webInsight = new WebInsightService(this.c2s);
    }
    return this._webInsight;
  }

  get prometheus(): PrometheusService {
    if (!this._prometheus) {
      this._prometheus = new PrometheusService();
    }
    return this._prometheus;
  }

  get leadAnalysis(): LeadAnalysisService {
    if (!this._leadAnalysis) {
      this._leadAnalysis = new LeadAnalysisService();
    }
    return this._leadAnalysis;
  }

  get cpfLookup(): CpfLookupService {
    if (!this._cpfLookup) {
      this._cpfLookup = new CpfLookupService();
    }
    return this._cpfLookup;
  }

  get bulkEnrichment(): BulkEnrichmentService {
    if (!this._bulkEnrichment) {
      this._bulkEnrichment = new BulkEnrichmentService();
    }
    return this._bulkEnrichment;
  }

  get profileReport(): ProfileReportService {
    if (!this._profileReport) {
      this._profileReport = new ProfileReportService();
    }
    return this._profileReport;
  }

  get leadQuality(): LeadQualityService {
    if (!this._leadQuality) {
      this._leadQuality = new LeadQualityService();
    }
    return this._leadQuality;
  }

  // Reset all services (useful for testing)
  reset(): void {
    this._workApi = undefined;
    this._diretrix = undefined;
    this._dbase = undefined;
    this._mimir = undefined;
    this._c2s = undefined;
    this._cpfDiscovery = undefined;
    this._enrichment = undefined;
    this._dbStorage = undefined;
    this._ibviProperty = undefined;
    this._webInsight = undefined;
    this._prometheus = undefined;
    this._leadAnalysis = undefined;
    this._cpfLookup = undefined;
    this._bulkEnrichment = undefined;
    this._profileReport = undefined;
    this._leadQuality = undefined;
  }
}

export const container = new ServiceContainer();

// Export type for MCP server
export type { ServiceContainer };
