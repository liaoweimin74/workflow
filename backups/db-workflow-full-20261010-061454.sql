/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19-11.8.6-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: 127.0.0.1    Database: workflow
-- ------------------------------------------------------
-- Server version	11.8.6-MariaDB-0+deb13u1 from Debian

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*M!100616 SET @OLD_NOTE_VERBOSITY=@@NOTE_VERBOSITY, NOTE_VERBOSITY=0 */;

--
-- Table structure for table `act_evt_log`
--

DROP TABLE IF EXISTS `act_evt_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_evt_log` (
  `LOG_NR_` bigint(20) NOT NULL AUTO_INCREMENT,
  `TYPE_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `TIME_STAMP_` timestamp(3) NOT NULL DEFAULT current_timestamp(3),
  `USER_ID_` varchar(255) DEFAULT NULL,
  `DATA_` longblob DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `LOCK_TIME_` timestamp(3) NULL DEFAULT NULL,
  `IS_PROCESSED_` tinyint(4) DEFAULT 0,
  PRIMARY KEY (`LOG_NR_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_evt_log`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_evt_log` WRITE;
/*!40000 ALTER TABLE `act_evt_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_evt_log` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ge_bytearray`
--

DROP TABLE IF EXISTS `act_ge_bytearray`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ge_bytearray` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(64) DEFAULT NULL,
  `BYTES_` longblob DEFAULT NULL,
  `GENERATED_` tinyint(4) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_BYTEAR_DEPL` (`DEPLOYMENT_ID_`),
  CONSTRAINT `ACT_FK_BYTEARR_DEPL` FOREIGN KEY (`DEPLOYMENT_ID_`) REFERENCES `act_re_deployment` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ge_bytearray`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ge_bytearray` WRITE;
/*!40000 ALTER TABLE `act_ge_bytearray` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ge_bytearray` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ge_property`
--

DROP TABLE IF EXISTS `act_ge_property`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ge_property` (
  `NAME_` varchar(64) NOT NULL,
  `VALUE_` varchar(300) DEFAULT NULL,
  `REV_` int(11) DEFAULT NULL,
  PRIMARY KEY (`NAME_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ge_property`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ge_property` WRITE;
/*!40000 ALTER TABLE `act_ge_property` DISABLE KEYS */;
INSERT INTO `act_ge_property` VALUES
('cfg.execution-related-entities-count','true',1),
('cfg.task-related-entities-count','true',1),
('common.schema.version','8.0.0.0',1),
('eventregistry.schema.version','8.0.0.0',1),
('next.dbid','1',1),
('schema.history','create(8.0.0.0)',1),
('schema.version','8.0.0.0',1);
/*!40000 ALTER TABLE `act_ge_property` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_actinst`
--

DROP TABLE IF EXISTS `act_hi_actinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_actinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_DEF_ID_` varchar(64) NOT NULL,
  `PROC_INST_ID_` varchar(64) NOT NULL,
  `EXECUTION_ID_` varchar(64) NOT NULL,
  `ACT_ID_` varchar(255) NOT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `CALL_PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACT_NAME_` varchar(255) DEFAULT NULL,
  `ACT_TYPE_` varchar(255) NOT NULL,
  `ASSIGNEE_` varchar(255) DEFAULT NULL,
  `COMPLETED_BY_` varchar(255) DEFAULT NULL,
  `START_TIME_` datetime(3) NOT NULL,
  `END_TIME_` datetime(3) DEFAULT NULL,
  `TRANSACTION_ORDER_` int(11) DEFAULT NULL,
  `DURATION_` bigint(20) DEFAULT NULL,
  `DELETE_REASON_` varchar(4000) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_ACT_INST_START` (`START_TIME_`),
  KEY `ACT_IDX_HI_ACT_INST_END` (`END_TIME_`),
  KEY `ACT_IDX_HI_ACT_INST_PROCINST` (`PROC_INST_ID_`,`ACT_ID_`),
  KEY `ACT_IDX_HI_ACT_INST_EXEC` (`EXECUTION_ID_`,`ACT_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_actinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_actinst` WRITE;
/*!40000 ALTER TABLE `act_hi_actinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_actinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_attachment`
--

DROP TABLE IF EXISTS `act_hi_attachment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_attachment` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `DESCRIPTION_` varchar(4000) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `URL_` varchar(4000) DEFAULT NULL,
  `CONTENT_ID_` varchar(64) DEFAULT NULL,
  `TIME_` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_attachment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_attachment` WRITE;
/*!40000 ALTER TABLE `act_hi_attachment` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_attachment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_comment`
--

DROP TABLE IF EXISTS `act_hi_comment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_comment` (
  `ID_` varchar(64) NOT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `TIME_` datetime(3) NOT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACTION_` varchar(255) DEFAULT NULL,
  `MESSAGE_` varchar(4000) DEFAULT NULL,
  `FULL_MSG_` longblob DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_comment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_comment` WRITE;
/*!40000 ALTER TABLE `act_hi_comment` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_comment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_detail`
--

DROP TABLE IF EXISTS `act_hi_detail`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_detail` (
  `ID_` varchar(64) NOT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `ACT_INST_ID_` varchar(64) DEFAULT NULL,
  `NAME_` varchar(255) NOT NULL,
  `VAR_TYPE_` varchar(255) DEFAULT NULL,
  `REV_` int(11) DEFAULT NULL,
  `TIME_` datetime(3) NOT NULL,
  `BYTEARRAY_ID_` varchar(64) DEFAULT NULL,
  `DOUBLE_` double DEFAULT NULL,
  `LONG_` bigint(20) DEFAULT NULL,
  `TEXT_` varchar(4000) DEFAULT NULL,
  `TEXT2_` varchar(4000) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_DETAIL_PROC_INST` (`PROC_INST_ID_`),
  KEY `ACT_IDX_HI_DETAIL_ACT_INST` (`ACT_INST_ID_`),
  KEY `ACT_IDX_HI_DETAIL_TIME` (`TIME_`),
  KEY `ACT_IDX_HI_DETAIL_NAME` (`NAME_`),
  KEY `ACT_IDX_HI_DETAIL_TASK_ID` (`TASK_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_detail`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_detail` WRITE;
/*!40000 ALTER TABLE `act_hi_detail` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_detail` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_entitylink`
--

DROP TABLE IF EXISTS `act_hi_entitylink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_entitylink` (
  `ID_` varchar(64) NOT NULL,
  `LINK_TYPE_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `PARENT_ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `ROOT_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `ROOT_SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `HIERARCHY_TYPE_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_ENT_LNK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_HI_ENT_LNK_REF_SCOPE` (`REF_SCOPE_ID_`,`REF_SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_HI_ENT_LNK_ROOT_SCOPE` (`ROOT_SCOPE_ID_`,`ROOT_SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_HI_ENT_LNK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`,`LINK_TYPE_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_entitylink`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_entitylink` WRITE;
/*!40000 ALTER TABLE `act_hi_entitylink` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_entitylink` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_identitylink`
--

DROP TABLE IF EXISTS `act_hi_identitylink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_identitylink` (
  `ID_` varchar(64) NOT NULL,
  `GROUP_ID_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_IDENT_LNK_USER` (`USER_ID_`),
  KEY `ACT_IDX_HI_IDENT_LNK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_IDENT_LNK_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_IDENT_LNK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_IDENT_LNK_TASK` (`TASK_ID_`),
  KEY `ACT_IDX_HI_IDENT_LNK_PROCINST` (`PROC_INST_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_identitylink`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_identitylink` WRITE;
/*!40000 ALTER TABLE `act_hi_identitylink` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_identitylink` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_procinst`
--

DROP TABLE IF EXISTS `act_hi_procinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_procinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_INST_ID_` varchar(64) NOT NULL,
  `BUSINESS_KEY_` varchar(255) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) NOT NULL,
  `START_TIME_` datetime(3) NOT NULL,
  `END_TIME_` datetime(3) DEFAULT NULL,
  `DURATION_` bigint(20) DEFAULT NULL,
  `START_USER_ID_` varchar(255) DEFAULT NULL,
  `START_ACT_ID_` varchar(255) DEFAULT NULL,
  `END_ACT_ID_` varchar(255) DEFAULT NULL,
  `SUPER_PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `DELETE_REASON_` varchar(4000) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `NAME_` varchar(255) DEFAULT NULL,
  `CALLBACK_ID_` varchar(255) DEFAULT NULL,
  `CALLBACK_TYPE_` varchar(255) DEFAULT NULL,
  `REFERENCE_ID_` varchar(255) DEFAULT NULL,
  `REFERENCE_TYPE_` varchar(255) DEFAULT NULL,
  `PROPAGATED_STAGE_INST_ID_` varchar(255) DEFAULT NULL,
  `BUSINESS_STATUS_` varchar(255) DEFAULT NULL,
  `END_USER_ID_` varchar(255) DEFAULT NULL,
  `STATE_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `PROC_INST_ID_` (`PROC_INST_ID_`),
  KEY `ACT_IDX_HI_PRO_INST_END` (`END_TIME_`),
  KEY `ACT_IDX_HI_PRO_I_BUSKEY` (`BUSINESS_KEY_`),
  KEY `ACT_IDX_HI_PRO_SUPER_PROCINST` (`SUPER_PROCESS_INSTANCE_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_procinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_procinst` WRITE;
/*!40000 ALTER TABLE `act_hi_procinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_procinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_taskinst`
--

DROP TABLE IF EXISTS `act_hi_taskinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_taskinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `TASK_DEF_ID_` varchar(64) DEFAULT NULL,
  `TASK_DEF_KEY_` varchar(255) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `PROPAGATED_STAGE_INST_ID_` varchar(255) DEFAULT NULL,
  `STATE_` varchar(255) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `PARENT_TASK_ID_` varchar(64) DEFAULT NULL,
  `DESCRIPTION_` varchar(4000) DEFAULT NULL,
  `OWNER_` varchar(255) DEFAULT NULL,
  `ASSIGNEE_` varchar(255) DEFAULT NULL,
  `START_TIME_` datetime(3) NOT NULL,
  `IN_PROGRESS_TIME_` datetime(3) DEFAULT NULL,
  `IN_PROGRESS_STARTED_BY_` varchar(255) DEFAULT NULL,
  `CLAIM_TIME_` datetime(3) DEFAULT NULL,
  `CLAIMED_BY_` varchar(255) DEFAULT NULL,
  `SUSPENDED_TIME_` datetime(3) DEFAULT NULL,
  `SUSPENDED_BY_` varchar(255) DEFAULT NULL,
  `END_TIME_` datetime(3) DEFAULT NULL,
  `COMPLETED_BY_` varchar(255) DEFAULT NULL,
  `DURATION_` bigint(20) DEFAULT NULL,
  `DELETE_REASON_` varchar(4000) DEFAULT NULL,
  `PRIORITY_` int(11) DEFAULT NULL,
  `IN_PROGRESS_DUE_DATE_` datetime(3) DEFAULT NULL,
  `DUE_DATE_` datetime(3) DEFAULT NULL,
  `FORM_KEY_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `LAST_UPDATED_TIME_` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_TASK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_TASK_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_TASK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_TASK_INST_PROCINST` (`PROC_INST_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_taskinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_taskinst` WRITE;
/*!40000 ALTER TABLE `act_hi_taskinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_taskinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_tsk_log`
--

DROP TABLE IF EXISTS `act_hi_tsk_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_tsk_log` (
  `ID_` bigint(20) NOT NULL AUTO_INCREMENT,
  `TYPE_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) NOT NULL,
  `TIME_STAMP_` timestamp(3) NOT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `DATA_` varchar(4000) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_ACT_HI_TSK_LOG_TASK` (`TASK_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_tsk_log`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_tsk_log` WRITE;
/*!40000 ALTER TABLE `act_hi_tsk_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_tsk_log` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_hi_varinst`
--

DROP TABLE IF EXISTS `act_hi_varinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_hi_varinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `NAME_` varchar(255) NOT NULL,
  `VAR_TYPE_` varchar(100) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `BYTEARRAY_ID_` varchar(64) DEFAULT NULL,
  `DOUBLE_` double DEFAULT NULL,
  `LONG_` bigint(20) DEFAULT NULL,
  `TEXT_` varchar(4000) DEFAULT NULL,
  `TEXT2_` varchar(4000) DEFAULT NULL,
  `META_INFO_` varchar(4000) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `LAST_UPDATED_TIME_` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_HI_PROCVAR_NAME_TYPE` (`NAME_`,`VAR_TYPE_`),
  KEY `ACT_IDX_HI_VAR_SCOPE_ID_TYPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_VAR_SUB_ID_TYPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_HI_PROCVAR_PROC_INST` (`PROC_INST_ID_`),
  KEY `ACT_IDX_HI_PROCVAR_TASK_ID` (`TASK_ID_`),
  KEY `ACT_IDX_HI_PROCVAR_EXE` (`EXECUTION_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_hi_varinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_hi_varinst` WRITE;
/*!40000 ALTER TABLE `act_hi_varinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_hi_varinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_bytearray`
--

DROP TABLE IF EXISTS `act_id_bytearray`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_bytearray` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `BYTES_` longblob DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_bytearray`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_bytearray` WRITE;
/*!40000 ALTER TABLE `act_id_bytearray` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_bytearray` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_group`
--

DROP TABLE IF EXISTS `act_id_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_group` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_group`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_group` WRITE;
/*!40000 ALTER TABLE `act_id_group` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_group` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_info`
--

DROP TABLE IF EXISTS `act_id_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_info` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `USER_ID_` varchar(64) DEFAULT NULL,
  `TYPE_` varchar(64) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `VALUE_` varchar(255) DEFAULT NULL,
  `PASSWORD_` longblob DEFAULT NULL,
  `PARENT_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_info`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_info` WRITE;
/*!40000 ALTER TABLE `act_id_info` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_info` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_membership`
--

DROP TABLE IF EXISTS `act_id_membership`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_membership` (
  `USER_ID_` varchar(64) NOT NULL,
  `GROUP_ID_` varchar(64) NOT NULL,
  PRIMARY KEY (`USER_ID_`,`GROUP_ID_`),
  KEY `ACT_FK_MEMB_GROUP` (`GROUP_ID_`),
  CONSTRAINT `ACT_FK_MEMB_GROUP` FOREIGN KEY (`GROUP_ID_`) REFERENCES `act_id_group` (`ID_`),
  CONSTRAINT `ACT_FK_MEMB_USER` FOREIGN KEY (`USER_ID_`) REFERENCES `act_id_user` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_membership`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_membership` WRITE;
/*!40000 ALTER TABLE `act_id_membership` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_membership` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_priv`
--

DROP TABLE IF EXISTS `act_id_priv`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_priv` (
  `ID_` varchar(64) NOT NULL,
  `NAME_` varchar(255) NOT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_UNIQ_PRIV_NAME` (`NAME_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_priv`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_priv` WRITE;
/*!40000 ALTER TABLE `act_id_priv` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_priv` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_priv_mapping`
--

DROP TABLE IF EXISTS `act_id_priv_mapping`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_priv_mapping` (
  `ID_` varchar(64) NOT NULL,
  `PRIV_ID_` varchar(64) NOT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `GROUP_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_FK_PRIV_MAPPING` (`PRIV_ID_`),
  KEY `ACT_IDX_PRIV_USER` (`USER_ID_`),
  KEY `ACT_IDX_PRIV_GROUP` (`GROUP_ID_`),
  CONSTRAINT `ACT_FK_PRIV_MAPPING` FOREIGN KEY (`PRIV_ID_`) REFERENCES `act_id_priv` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_priv_mapping`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_priv_mapping` WRITE;
/*!40000 ALTER TABLE `act_id_priv_mapping` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_priv_mapping` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_property`
--

DROP TABLE IF EXISTS `act_id_property`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_property` (
  `NAME_` varchar(64) NOT NULL,
  `VALUE_` varchar(300) DEFAULT NULL,
  `REV_` int(11) DEFAULT NULL,
  PRIMARY KEY (`NAME_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_property`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_property` WRITE;
/*!40000 ALTER TABLE `act_id_property` DISABLE KEYS */;
INSERT INTO `act_id_property` VALUES
('schema.version','8.0.0.0',1);
/*!40000 ALTER TABLE `act_id_property` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_token`
--

DROP TABLE IF EXISTS `act_id_token`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_token` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `TOKEN_VALUE_` varchar(255) DEFAULT NULL,
  `TOKEN_DATE_` timestamp(3) NULL DEFAULT NULL,
  `IP_ADDRESS_` varchar(255) DEFAULT NULL,
  `USER_AGENT_` varchar(255) DEFAULT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `TOKEN_DATA_` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_token`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_token` WRITE;
/*!40000 ALTER TABLE `act_id_token` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_token` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_id_user`
--

DROP TABLE IF EXISTS `act_id_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_id_user` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `FIRST_` varchar(255) DEFAULT NULL,
  `LAST_` varchar(255) DEFAULT NULL,
  `DISPLAY_NAME_` varchar(255) DEFAULT NULL,
  `EMAIL_` varchar(255) DEFAULT NULL,
  `PWD_` varchar(255) DEFAULT NULL,
  `PICTURE_ID_` varchar(64) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_id_user`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_id_user` WRITE;
/*!40000 ALTER TABLE `act_id_user` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_id_user` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_procdef_info`
--

DROP TABLE IF EXISTS `act_procdef_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_procdef_info` (
  `ID_` varchar(64) NOT NULL,
  `PROC_DEF_ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `INFO_JSON_ID_` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_UNIQ_INFO_PROCDEF` (`PROC_DEF_ID_`),
  KEY `ACT_IDX_INFO_PROCDEF` (`PROC_DEF_ID_`),
  KEY `ACT_FK_INFO_JSON_BA` (`INFO_JSON_ID_`),
  CONSTRAINT `ACT_FK_INFO_JSON_BA` FOREIGN KEY (`INFO_JSON_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_INFO_PROCDEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_procdef_info`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_procdef_info` WRITE;
/*!40000 ALTER TABLE `act_procdef_info` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_procdef_info` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_re_deployment`
--

DROP TABLE IF EXISTS `act_re_deployment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_re_deployment` (
  `ID_` varchar(64) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `DEPLOY_TIME_` timestamp(3) NULL DEFAULT NULL,
  `DERIVED_FROM_` varchar(64) DEFAULT NULL,
  `DERIVED_FROM_ROOT_` varchar(64) DEFAULT NULL,
  `PARENT_DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  `ENGINE_VERSION_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_re_deployment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_re_deployment` WRITE;
/*!40000 ALTER TABLE `act_re_deployment` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_re_deployment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_re_model`
--

DROP TABLE IF EXISTS `act_re_model`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_re_model` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LAST_UPDATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `VERSION_` int(11) DEFAULT NULL,
  `META_INFO_` varchar(4000) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(64) DEFAULT NULL,
  `EDITOR_SOURCE_VALUE_ID_` varchar(64) DEFAULT NULL,
  `EDITOR_SOURCE_EXTRA_VALUE_ID_` varchar(64) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_FK_MODEL_SOURCE` (`EDITOR_SOURCE_VALUE_ID_`),
  KEY `ACT_FK_MODEL_SOURCE_EXTRA` (`EDITOR_SOURCE_EXTRA_VALUE_ID_`),
  KEY `ACT_FK_MODEL_DEPLOYMENT` (`DEPLOYMENT_ID_`),
  CONSTRAINT `ACT_FK_MODEL_DEPLOYMENT` FOREIGN KEY (`DEPLOYMENT_ID_`) REFERENCES `act_re_deployment` (`ID_`),
  CONSTRAINT `ACT_FK_MODEL_SOURCE` FOREIGN KEY (`EDITOR_SOURCE_VALUE_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_MODEL_SOURCE_EXTRA` FOREIGN KEY (`EDITOR_SOURCE_EXTRA_VALUE_ID_`) REFERENCES `act_ge_bytearray` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_re_model`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_re_model` WRITE;
/*!40000 ALTER TABLE `act_re_model` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_re_model` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_re_procdef`
--

DROP TABLE IF EXISTS `act_re_procdef`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_re_procdef` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `KEY_` varchar(255) NOT NULL,
  `VERSION_` int(11) NOT NULL,
  `DEPLOYMENT_ID_` varchar(64) DEFAULT NULL,
  `RESOURCE_NAME_` varchar(4000) DEFAULT NULL,
  `DGRM_RESOURCE_NAME_` varchar(4000) DEFAULT NULL,
  `DESCRIPTION_` varchar(4000) DEFAULT NULL,
  `HAS_START_FORM_KEY_` tinyint(4) DEFAULT NULL,
  `HAS_GRAPHICAL_NOTATION_` tinyint(4) DEFAULT NULL,
  `SUSPENSION_STATE_` int(11) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `ENGINE_VERSION_` varchar(255) DEFAULT NULL,
  `DERIVED_FROM_` varchar(64) DEFAULT NULL,
  `DERIVED_FROM_ROOT_` varchar(64) DEFAULT NULL,
  `DERIVED_VERSION_` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_UNIQ_PROCDEF` (`KEY_`,`VERSION_`,`DERIVED_VERSION_`,`TENANT_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_re_procdef`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_re_procdef` WRITE;
/*!40000 ALTER TABLE `act_re_procdef` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_re_procdef` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_actinst`
--

DROP TABLE IF EXISTS `act_ru_actinst`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_actinst` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT 1,
  `PROC_DEF_ID_` varchar(64) NOT NULL,
  `PROC_INST_ID_` varchar(64) NOT NULL,
  `EXECUTION_ID_` varchar(64) NOT NULL,
  `ACT_ID_` varchar(255) NOT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `CALL_PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACT_NAME_` varchar(255) DEFAULT NULL,
  `ACT_TYPE_` varchar(255) NOT NULL,
  `ASSIGNEE_` varchar(255) DEFAULT NULL,
  `COMPLETED_BY_` varchar(255) DEFAULT NULL,
  `START_TIME_` datetime(3) NOT NULL,
  `END_TIME_` datetime(3) DEFAULT NULL,
  `DURATION_` bigint(20) DEFAULT NULL,
  `TRANSACTION_ORDER_` int(11) DEFAULT NULL,
  `DELETE_REASON_` varchar(4000) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_RU_ACTI_START` (`START_TIME_`),
  KEY `ACT_IDX_RU_ACTI_END` (`END_TIME_`),
  KEY `ACT_IDX_RU_ACTI_PROC` (`PROC_INST_ID_`),
  KEY `ACT_IDX_RU_ACTI_PROC_ACT` (`PROC_INST_ID_`,`ACT_ID_`),
  KEY `ACT_IDX_RU_ACTI_EXEC` (`EXECUTION_ID_`),
  KEY `ACT_IDX_RU_ACTI_EXEC_ACT` (`EXECUTION_ID_`,`ACT_ID_`),
  KEY `ACT_IDX_RU_ACTI_TASK` (`TASK_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_actinst`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_actinst` WRITE;
/*!40000 ALTER TABLE `act_ru_actinst` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_actinst` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_deadletter_job`
--

DROP TABLE IF EXISTS `act_ru_deadletter_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_deadletter_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_DEADLETTER_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_DEADLETTER_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_DEADLETTER_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_DJOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_DJOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_DJOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_DEADLETTER_JOB_EXECUTION` (`EXECUTION_ID_`),
  KEY `ACT_FK_DEADLETTER_JOB_PROCESS_INSTANCE` (`PROCESS_INSTANCE_ID_`),
  KEY `ACT_FK_DEADLETTER_JOB_PROC_DEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_EXECUTION` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_PROCESS_INSTANCE` FOREIGN KEY (`PROCESS_INSTANCE_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_DEADLETTER_JOB_PROC_DEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_deadletter_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_deadletter_job` WRITE;
/*!40000 ALTER TABLE `act_ru_deadletter_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_deadletter_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_entitylink`
--

DROP TABLE IF EXISTS `act_ru_entitylink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_entitylink` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `LINK_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `PARENT_ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `REF_SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `ROOT_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `ROOT_SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `HIERARCHY_TYPE_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_ENT_LNK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_ENT_LNK_REF_SCOPE` (`REF_SCOPE_ID_`,`REF_SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_ENT_LNK_ROOT_SCOPE` (`ROOT_SCOPE_ID_`,`ROOT_SCOPE_TYPE_`,`LINK_TYPE_`),
  KEY `ACT_IDX_ENT_LNK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`,`LINK_TYPE_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_entitylink`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_entitylink` WRITE;
/*!40000 ALTER TABLE `act_ru_entitylink` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_entitylink` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_event_subscr`
--

DROP TABLE IF EXISTS `act_ru_event_subscr`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_event_subscr` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `EVENT_TYPE_` varchar(255) NOT NULL,
  `EVENT_NAME_` varchar(255) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACTIVITY_ID_` varchar(64) DEFAULT NULL,
  `CONFIGURATION_` varchar(255) DEFAULT NULL,
  `CREATED_` timestamp(3) NOT NULL DEFAULT current_timestamp(3),
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_DEFINITION_KEY_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(64) DEFAULT NULL,
  `LOCK_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_EVENT_SUBSCR_CONFIG_` (`CONFIGURATION_`),
  KEY `ACT_IDX_EVENT_SUBSCR_EXEC_ID` (`EXECUTION_ID_`),
  KEY `ACT_IDX_EVENT_SUBSCR_PROC_ID` (`PROC_INST_ID_`),
  KEY `ACT_IDX_EVENT_SUBSCR_SCOPEREF_` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  CONSTRAINT `ACT_FK_EVENT_EXEC` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_event_subscr`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_event_subscr` WRITE;
/*!40000 ALTER TABLE `act_ru_event_subscr` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_event_subscr` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_execution`
--

DROP TABLE IF EXISTS `act_ru_execution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_execution` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `BUSINESS_KEY_` varchar(255) DEFAULT NULL,
  `PARENT_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `SUPER_EXEC_` varchar(64) DEFAULT NULL,
  `ROOT_PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `ACT_ID_` varchar(255) DEFAULT NULL,
  `IS_ACTIVE_` tinyint(4) DEFAULT NULL,
  `IS_CONCURRENT_` tinyint(4) DEFAULT NULL,
  `IS_SCOPE_` tinyint(4) DEFAULT NULL,
  `IS_EVENT_SCOPE_` tinyint(4) DEFAULT NULL,
  `IS_MI_ROOT_` tinyint(4) DEFAULT NULL,
  `SUSPENSION_STATE_` int(11) DEFAULT NULL,
  `CACHED_ENT_STATE_` int(11) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `NAME_` varchar(255) DEFAULT NULL,
  `START_ACT_ID_` varchar(255) DEFAULT NULL,
  `START_TIME_` datetime(3) DEFAULT NULL,
  `START_USER_ID_` varchar(255) DEFAULT NULL,
  `LOCK_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `IS_COUNT_ENABLED_` tinyint(4) DEFAULT NULL,
  `EVT_SUBSCR_COUNT_` int(11) DEFAULT NULL,
  `TASK_COUNT_` int(11) DEFAULT NULL,
  `JOB_COUNT_` int(11) DEFAULT NULL,
  `TIMER_JOB_COUNT_` int(11) DEFAULT NULL,
  `SUSP_JOB_COUNT_` int(11) DEFAULT NULL,
  `DEADLETTER_JOB_COUNT_` int(11) DEFAULT NULL,
  `EXTERNAL_WORKER_JOB_COUNT_` int(11) DEFAULT NULL,
  `VAR_COUNT_` int(11) DEFAULT NULL,
  `ID_LINK_COUNT_` int(11) DEFAULT NULL,
  `CALLBACK_ID_` varchar(255) DEFAULT NULL,
  `CALLBACK_TYPE_` varchar(255) DEFAULT NULL,
  `REFERENCE_ID_` varchar(255) DEFAULT NULL,
  `REFERENCE_TYPE_` varchar(255) DEFAULT NULL,
  `PROPAGATED_STAGE_INST_ID_` varchar(255) DEFAULT NULL,
  `BUSINESS_STATUS_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_EXEC_BUSKEY` (`BUSINESS_KEY_`),
  KEY `ACT_IDC_EXEC_ROOT` (`ROOT_PROC_INST_ID_`),
  KEY `ACT_IDX_EXEC_REF_ID_` (`REFERENCE_ID_`),
  KEY `ACT_FK_EXE_PROCINST` (`PROC_INST_ID_`),
  KEY `ACT_FK_EXE_PARENT` (`PARENT_ID_`),
  KEY `ACT_FK_EXE_SUPER` (`SUPER_EXEC_`),
  KEY `ACT_FK_EXE_PROCDEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_EXE_PARENT` FOREIGN KEY (`PARENT_ID_`) REFERENCES `act_ru_execution` (`ID_`) ON DELETE CASCADE,
  CONSTRAINT `ACT_FK_EXE_PROCDEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`),
  CONSTRAINT `ACT_FK_EXE_PROCINST` FOREIGN KEY (`PROC_INST_ID_`) REFERENCES `act_ru_execution` (`ID_`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ACT_FK_EXE_SUPER` FOREIGN KEY (`SUPER_EXEC_`) REFERENCES `act_ru_execution` (`ID_`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_execution`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_execution` WRITE;
/*!40000 ALTER TABLE `act_ru_execution` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_execution` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_external_job`
--

DROP TABLE IF EXISTS `act_ru_external_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_external_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `LOCK_EXP_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_EXTERNAL_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_EXTERNAL_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_EXTERNAL_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_EJOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_EJOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_EJOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  CONSTRAINT `ACT_FK_EXTERNAL_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_EXTERNAL_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_external_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_external_job` WRITE;
/*!40000 ALTER TABLE `act_ru_external_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_external_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_history_job`
--

DROP TABLE IF EXISTS `act_ru_history_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_history_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `LOCK_EXP_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `ADV_HANDLER_CFG_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_history_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_history_job` WRITE;
/*!40000 ALTER TABLE `act_ru_history_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_history_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_identitylink`
--

DROP TABLE IF EXISTS `act_ru_identitylink`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_identitylink` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `GROUP_ID_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `USER_ID_` varchar(255) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_IDENT_LNK_USER` (`USER_ID_`),
  KEY `ACT_IDX_IDENT_LNK_GROUP` (`GROUP_ID_`),
  KEY `ACT_IDX_IDENT_LNK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_IDENT_LNK_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_IDENT_LNK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_ATHRZ_PROCEDEF` (`PROC_DEF_ID_`),
  KEY `ACT_FK_TSKASS_TASK` (`TASK_ID_`),
  KEY `ACT_FK_IDL_PROCINST` (`PROC_INST_ID_`),
  CONSTRAINT `ACT_FK_ATHRZ_PROCEDEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`),
  CONSTRAINT `ACT_FK_IDL_PROCINST` FOREIGN KEY (`PROC_INST_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_TSKASS_TASK` FOREIGN KEY (`TASK_ID_`) REFERENCES `act_ru_task` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_identitylink`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_identitylink` WRITE;
/*!40000 ALTER TABLE `act_ru_identitylink` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_identitylink` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_job`
--

DROP TABLE IF EXISTS `act_ru_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `LOCK_EXP_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_JOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_JOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_JOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_JOB_EXECUTION` (`EXECUTION_ID_`),
  KEY `ACT_FK_JOB_PROCESS_INSTANCE` (`PROCESS_INSTANCE_ID_`),
  KEY `ACT_FK_JOB_PROC_DEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_JOB_EXECUTION` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_JOB_PROCESS_INSTANCE` FOREIGN KEY (`PROCESS_INSTANCE_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_JOB_PROC_DEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_job` WRITE;
/*!40000 ALTER TABLE `act_ru_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_suspended_job`
--

DROP TABLE IF EXISTS `act_ru_suspended_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_suspended_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_SUSPENDED_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_SUSPENDED_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_SUSPENDED_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_SJOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_SJOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_SJOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_SUSPENDED_JOB_EXECUTION` (`EXECUTION_ID_`),
  KEY `ACT_FK_SUSPENDED_JOB_PROCESS_INSTANCE` (`PROCESS_INSTANCE_ID_`),
  KEY `ACT_FK_SUSPENDED_JOB_PROC_DEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_EXECUTION` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_PROCESS_INSTANCE` FOREIGN KEY (`PROCESS_INSTANCE_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_SUSPENDED_JOB_PROC_DEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_suspended_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_suspended_job` WRITE;
/*!40000 ALTER TABLE `act_ru_suspended_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_suspended_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_task`
--

DROP TABLE IF EXISTS `act_ru_task`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_task` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `TASK_DEF_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `PROPAGATED_STAGE_INST_ID_` varchar(255) DEFAULT NULL,
  `STATE_` varchar(255) DEFAULT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `PARENT_TASK_ID_` varchar(64) DEFAULT NULL,
  `DESCRIPTION_` varchar(4000) DEFAULT NULL,
  `TASK_DEF_KEY_` varchar(255) DEFAULT NULL,
  `OWNER_` varchar(255) DEFAULT NULL,
  `ASSIGNEE_` varchar(255) DEFAULT NULL,
  `DELEGATION_` varchar(64) DEFAULT NULL,
  `PRIORITY_` int(11) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `IN_PROGRESS_TIME_` datetime(3) DEFAULT NULL,
  `IN_PROGRESS_STARTED_BY_` varchar(255) DEFAULT NULL,
  `CLAIM_TIME_` datetime(3) DEFAULT NULL,
  `CLAIMED_BY_` varchar(255) DEFAULT NULL,
  `SUSPENDED_TIME_` datetime(3) DEFAULT NULL,
  `SUSPENDED_BY_` varchar(255) DEFAULT NULL,
  `IN_PROGRESS_DUE_DATE_` datetime(3) DEFAULT NULL,
  `DUE_DATE_` datetime(3) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `SUSPENSION_STATE_` int(11) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  `FORM_KEY_` varchar(255) DEFAULT NULL,
  `IS_COUNT_ENABLED_` tinyint(4) DEFAULT NULL,
  `VAR_COUNT_` int(11) DEFAULT NULL,
  `ID_LINK_COUNT_` int(11) DEFAULT NULL,
  `SUB_TASK_COUNT_` int(11) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_TASK_CREATE` (`CREATE_TIME_`),
  KEY `ACT_IDX_TASK_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_TASK_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_TASK_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_TASK_EXE` (`EXECUTION_ID_`),
  KEY `ACT_FK_TASK_PROCINST` (`PROC_INST_ID_`),
  KEY `ACT_FK_TASK_PROCDEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_TASK_EXE` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_TASK_PROCDEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`),
  CONSTRAINT `ACT_FK_TASK_PROCINST` FOREIGN KEY (`PROC_INST_ID_`) REFERENCES `act_ru_execution` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_task`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_task` WRITE;
/*!40000 ALTER TABLE `act_ru_task` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_task` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_timer_job`
--

DROP TABLE IF EXISTS `act_ru_timer_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_timer_job` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `LOCK_EXP_TIME_` timestamp(3) NULL DEFAULT NULL,
  `LOCK_OWNER_` varchar(255) DEFAULT NULL,
  `EXCLUSIVE_` tinyint(1) DEFAULT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROCESS_INSTANCE_ID_` varchar(64) DEFAULT NULL,
  `PROC_DEF_ID_` varchar(64) DEFAULT NULL,
  `ELEMENT_ID_` varchar(255) DEFAULT NULL,
  `ELEMENT_NAME_` varchar(255) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `SCOPE_DEFINITION_ID_` varchar(255) DEFAULT NULL,
  `CORRELATION_ID_` varchar(255) DEFAULT NULL,
  `RETRIES_` int(11) DEFAULT NULL,
  `EXCEPTION_STACK_ID_` varchar(64) DEFAULT NULL,
  `EXCEPTION_MSG_` varchar(4000) DEFAULT NULL,
  `DUEDATE_` timestamp(3) NULL DEFAULT NULL,
  `REPEAT_` varchar(255) DEFAULT NULL,
  `HANDLER_TYPE_` varchar(255) DEFAULT NULL,
  `HANDLER_CFG_` varchar(4000) DEFAULT NULL,
  `CUSTOM_VALUES_ID_` varchar(64) DEFAULT NULL,
  `CREATE_TIME_` timestamp(3) NULL DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_TIMER_JOB_EXCEPTION_STACK_ID` (`EXCEPTION_STACK_ID_`),
  KEY `ACT_IDX_TIMER_JOB_CUSTOM_VALUES_ID` (`CUSTOM_VALUES_ID_`),
  KEY `ACT_IDX_TIMER_JOB_CORRELATION_ID` (`CORRELATION_ID_`),
  KEY `ACT_IDX_TIMER_JOB_DUEDATE` (`DUEDATE_`),
  KEY `ACT_IDX_TJOB_SCOPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_TJOB_SUB_SCOPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_TJOB_SCOPE_DEF` (`SCOPE_DEFINITION_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_TIMER_JOB_EXECUTION` (`EXECUTION_ID_`),
  KEY `ACT_FK_TIMER_JOB_PROCESS_INSTANCE` (`PROCESS_INSTANCE_ID_`),
  KEY `ACT_FK_TIMER_JOB_PROC_DEF` (`PROC_DEF_ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_CUSTOM_VALUES` FOREIGN KEY (`CUSTOM_VALUES_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_EXCEPTION` FOREIGN KEY (`EXCEPTION_STACK_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_EXECUTION` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_PROCESS_INSTANCE` FOREIGN KEY (`PROCESS_INSTANCE_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_TIMER_JOB_PROC_DEF` FOREIGN KEY (`PROC_DEF_ID_`) REFERENCES `act_re_procdef` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_timer_job`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_timer_job` WRITE;
/*!40000 ALTER TABLE `act_ru_timer_job` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_timer_job` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `act_ru_variable`
--

DROP TABLE IF EXISTS `act_ru_variable`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `act_ru_variable` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `TYPE_` varchar(255) NOT NULL,
  `NAME_` varchar(255) NOT NULL,
  `EXECUTION_ID_` varchar(64) DEFAULT NULL,
  `PROC_INST_ID_` varchar(64) DEFAULT NULL,
  `TASK_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(255) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(255) DEFAULT NULL,
  `BYTEARRAY_ID_` varchar(64) DEFAULT NULL,
  `DOUBLE_` double DEFAULT NULL,
  `LONG_` bigint(20) DEFAULT NULL,
  `TEXT_` varchar(4000) DEFAULT NULL,
  `TEXT2_` varchar(4000) DEFAULT NULL,
  `META_INFO_` varchar(4000) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `ACT_IDX_RU_VAR_SCOPE_ID_TYPE` (`SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_IDX_RU_VAR_SUB_ID_TYPE` (`SUB_SCOPE_ID_`,`SCOPE_TYPE_`),
  KEY `ACT_FK_VAR_BYTEARRAY` (`BYTEARRAY_ID_`),
  KEY `ACT_IDX_VARIABLE_TASK_ID` (`TASK_ID_`),
  KEY `ACT_FK_VAR_EXE` (`EXECUTION_ID_`),
  KEY `ACT_FK_VAR_PROCINST` (`PROC_INST_ID_`),
  CONSTRAINT `ACT_FK_VAR_BYTEARRAY` FOREIGN KEY (`BYTEARRAY_ID_`) REFERENCES `act_ge_bytearray` (`ID_`),
  CONSTRAINT `ACT_FK_VAR_EXE` FOREIGN KEY (`EXECUTION_ID_`) REFERENCES `act_ru_execution` (`ID_`),
  CONSTRAINT `ACT_FK_VAR_PROCINST` FOREIGN KEY (`PROC_INST_ID_`) REFERENCES `act_ru_execution` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `act_ru_variable`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `act_ru_variable` WRITE;
/*!40000 ALTER TABLE `act_ru_variable` DISABLE KEYS */;
/*!40000 ALTER TABLE `act_ru_variable` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `event_publication`
--

DROP TABLE IF EXISTS `event_publication`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_publication` (
  `id` uuid NOT NULL,
  `completion_attempts` int(11) NOT NULL,
  `completion_date` datetime(6) DEFAULT NULL,
  `event_type` varchar(255) DEFAULT NULL,
  `last_resubmission_date` datetime(6) DEFAULT NULL,
  `listener_id` varchar(255) DEFAULT NULL,
  `publication_date` datetime(6) DEFAULT NULL,
  `serialized_event` varchar(255) DEFAULT NULL,
  `status` enum('COMPLETED','FAILED','PROCESSING','PUBLISHED','RESUBMITTED') DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_publication`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `event_publication` WRITE;
/*!40000 ALTER TABLE `event_publication` DISABLE KEYS */;
/*!40000 ALTER TABLE `event_publication` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_channel_definition`
--

DROP TABLE IF EXISTS `flw_channel_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_channel_definition` (
  `ID_` varchar(255) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `VERSION_` int(11) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `TYPE_` varchar(255) DEFAULT NULL,
  `IMPLEMENTATION_` varchar(255) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT NULL,
  `RESOURCE_NAME_` varchar(255) DEFAULT NULL,
  `DESCRIPTION_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_IDX_CHANNEL_DEF_UNIQ` (`KEY_`,`VERSION_`,`TENANT_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_channel_definition`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_channel_definition` WRITE;
/*!40000 ALTER TABLE `flw_channel_definition` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_channel_definition` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_event_definition`
--

DROP TABLE IF EXISTS `flw_event_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_event_definition` (
  `ID_` varchar(255) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `VERSION_` int(11) DEFAULT NULL,
  `KEY_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT NULL,
  `RESOURCE_NAME_` varchar(255) DEFAULT NULL,
  `DESCRIPTION_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  UNIQUE KEY `ACT_IDX_EVENT_DEF_UNIQ` (`KEY_`,`VERSION_`,`TENANT_ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_event_definition`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_event_definition` WRITE;
/*!40000 ALTER TABLE `flw_event_definition` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_event_definition` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_event_deployment`
--

DROP TABLE IF EXISTS `flw_event_deployment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_event_deployment` (
  `ID_` varchar(255) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `CATEGORY_` varchar(255) DEFAULT NULL,
  `DEPLOY_TIME_` datetime(3) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT NULL,
  `PARENT_DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_event_deployment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_event_deployment` WRITE;
/*!40000 ALTER TABLE `flw_event_deployment` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_event_deployment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_event_resource`
--

DROP TABLE IF EXISTS `flw_event_resource`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_event_resource` (
  `ID_` varchar(255) NOT NULL,
  `NAME_` varchar(255) DEFAULT NULL,
  `DEPLOYMENT_ID_` varchar(255) DEFAULT NULL,
  `RESOURCE_BYTES_` longblob DEFAULT NULL,
  PRIMARY KEY (`ID_`),
  KEY `FLW_IDX_EVENT_RSRC_DPL` (`DEPLOYMENT_ID_`),
  CONSTRAINT `FLW_FK_EVENT_RSRC_DPL` FOREIGN KEY (`DEPLOYMENT_ID_`) REFERENCES `flw_event_deployment` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_event_resource`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_event_resource` WRITE;
/*!40000 ALTER TABLE `flw_event_resource` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_event_resource` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_ru_batch`
--

DROP TABLE IF EXISTS `flw_ru_batch`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_ru_batch` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `TYPE_` varchar(64) NOT NULL,
  `SEARCH_KEY_` varchar(255) DEFAULT NULL,
  `SEARCH_KEY2_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) NOT NULL,
  `COMPLETE_TIME_` datetime(3) DEFAULT NULL,
  `STATUS_` varchar(255) DEFAULT NULL,
  `BATCH_DOC_ID_` varchar(64) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_ru_batch`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_ru_batch` WRITE;
/*!40000 ALTER TABLE `flw_ru_batch` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_ru_batch` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flw_ru_batch_part`
--

DROP TABLE IF EXISTS `flw_ru_batch_part`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flw_ru_batch_part` (
  `ID_` varchar(64) NOT NULL,
  `REV_` int(11) DEFAULT NULL,
  `BATCH_ID_` varchar(64) DEFAULT NULL,
  `TYPE_` varchar(64) NOT NULL,
  `SCOPE_ID_` varchar(64) DEFAULT NULL,
  `SUB_SCOPE_ID_` varchar(64) DEFAULT NULL,
  `SCOPE_TYPE_` varchar(64) DEFAULT NULL,
  `SEARCH_KEY_` varchar(255) DEFAULT NULL,
  `SEARCH_KEY2_` varchar(255) DEFAULT NULL,
  `CREATE_TIME_` datetime(3) NOT NULL,
  `COMPLETE_TIME_` datetime(3) DEFAULT NULL,
  `STATUS_` varchar(255) DEFAULT NULL,
  `RESULT_DOC_ID_` varchar(64) DEFAULT NULL,
  `TENANT_ID_` varchar(255) DEFAULT '',
  PRIMARY KEY (`ID_`),
  KEY `FLW_IDX_BATCH_PART` (`BATCH_ID_`),
  CONSTRAINT `FLW_FK_BATCH_PART_PARENT` FOREIGN KEY (`BATCH_ID_`) REFERENCES `flw_ru_batch` (`ID_`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flw_ru_batch_part`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flw_ru_batch_part` WRITE;
/*!40000 ALTER TABLE `flw_ru_batch_part` DISABLE KEYS */;
/*!40000 ALTER TABLE `flw_ru_batch_part` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `flyway_schema_history`
--

DROP TABLE IF EXISTS `flyway_schema_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `flyway_schema_history` (
  `installed_rank` int(11) NOT NULL,
  `version` varchar(50) DEFAULT NULL,
  `description` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL,
  `script` varchar(1000) NOT NULL,
  `checksum` int(11) DEFAULT NULL,
  `installed_by` varchar(100) NOT NULL,
  `installed_on` timestamp NOT NULL DEFAULT current_timestamp(),
  `execution_time` int(11) NOT NULL,
  `success` tinyint(1) NOT NULL,
  PRIMARY KEY (`installed_rank`),
  KEY `flyway_schema_history_s_idx` (`success`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `flyway_schema_history`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `flyway_schema_history` WRITE;
/*!40000 ALTER TABLE `flyway_schema_history` DISABLE KEYS */;
INSERT INTO `flyway_schema_history` VALUES
(1,'1','<< Flyway Baseline >>','BASELINE','<< Flyway Baseline >>',NULL,'root','2026-09-11 10:30:10',0,1),
(2,'2','init','SQL','V2__init.sql',84590707,'root','2026-09-11 10:30:10',25,1),
(3,'1','workflow','SQL','V1__workflow.sql',-1390981594,'root','2026-10-09 00:05:46',255,1),
(4,'39','builtin data sources','SQL','V39__builtin_data_sources.sql',-473665810,'root','2026-10-09 00:05:46',7,1),
(5,'40','create engine notify','SQL','V40__create_engine_notify.sql',-61291012,'root','2026-10-09 00:05:46',2,1),
(6,'41','add task comment signature','SQL','V41__add_task_comment_signature.sql',-317086640,'root','2026-10-09 00:05:46',2,1),
(7,'49','menu trio and posts recovery','SQL','V49__menu_trio_and_posts_recovery.sql',1233929668,'root','2026-10-09 00:05:46',34,1),
(8,'50','member group dedicated tables','SQL','V50__member_group_dedicated_tables.sql',143610301,'root','2026-10-09 00:05:46',7,1),
(9,'51','sys attachment','SQL','V51__sys_attachment.sql',-1828141019,'root','2026-10-09 00:05:46',2,1),
(10,'52','sys attachment image meta','SQL','V52__sys_attachment_image_meta.sql',1003945511,'root','2026-10-09 00:05:46',1,1),
(11,'53','add logic flow menu','SQL','V53__add_logic_flow_menu.sql',-1564541405,'root','2026-10-09 00:05:46',1,1);
/*!40000 ALTER TABLE `flyway_schema_history` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_channel_config`
--

DROP TABLE IF EXISTS `msg_channel_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_channel_config` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `config_key` varchar(64) NOT NULL,
  `config_value` text DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `is_encrypted` bit(1) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKn88wqw1d54i7fcsdtd7wfi4l4` (`channel`,`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_channel_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_channel_config` WRITE;
/*!40000 ALTER TABLE `msg_channel_config` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_channel_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_delivery_retry`
--

DROP TABLE IF EXISTS `msg_delivery_retry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_delivery_retry` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `last_error` text DEFAULT NULL,
  `max_retry` int(11) NOT NULL,
  `message_id` bigint(20) NOT NULL,
  `next_retry_at` datetime(6) DEFAULT NULL,
  `recipient_id` bigint(20) NOT NULL,
  `retry_count` int(11) NOT NULL,
  `status` enum('DELETED','FAILED','PENDING','READ','SENT') NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_recipient` (`recipient_id`),
  KEY `idx_next_retry` (`next_retry_at`),
  KEY `idx_retry_status_next` (`status`,`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_delivery_retry`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_delivery_retry` WRITE;
/*!40000 ALTER TABLE `msg_delivery_retry` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_delivery_retry` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_event_definition`
--

DROP TABLE IF EXISTS `msg_event_definition`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_event_definition` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `business_domain` varchar(64) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `created_by` varchar(64) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `enabled` bit(1) NOT NULL,
  `event_code` varchar(64) NOT NULL,
  `event_name` varchar(128) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKolg4hnibtg7ilx604d443v28s` (`tenant_id`,`event_code`),
  KEY `idx_event_tenant_enabled` (`tenant_id`,`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_event_definition`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_event_definition` WRITE;
/*!40000 ALTER TABLE `msg_event_definition` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_event_definition` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_message`
--

DROP TABLE IF EXISTS `msg_message`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_message` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `category` enum('APPROVAL','NOTIFICATION','SYSTEM','TASK','WORKFLOW') DEFAULT NULL,
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`content`)),
  `content_type` enum('MARKDOWN','TEXT') DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `event_code` varchar(64) DEFAULT NULL,
  `link_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`link_json`)),
  `message_type` enum('PRIVATE','PUBLIC','SYSTEM') DEFAULT NULL,
  `priority` enum('HIGH','LOW','NORMAL','URGENT') DEFAULT NULL,
  `sender_id` bigint(20) NOT NULL,
  `sender_type` varchar(32) NOT NULL,
  `status` enum('DELETED','FAILED','PENDING','READ','SENT') DEFAULT NULL,
  `template_code` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_template` (`template_code`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_message`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_message` WRITE;
/*!40000 ALTER TABLE `msg_message` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_message` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_recipient`
--

DROP TABLE IF EXISTS `msg_recipient`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_recipient` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `message_id` bigint(20) NOT NULL,
  `nickname` varchar(64) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `sent_at` datetime(6) DEFAULT NULL,
  `status` enum('DELIVERED','FAILED','PENDING','READ','SENT') NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  `username` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_message` (`message_id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_recipient`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_recipient` WRITE;
/*!40000 ALTER TABLE `msg_recipient` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_recipient` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_subscription_rule`
--

DROP TABLE IF EXISTS `msg_subscription_rule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_subscription_rule` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `action` enum('ALLOW','DENY','FORCE') NOT NULL,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `condition_expr` text DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(64) DEFAULT NULL,
  `enable` bit(1) NOT NULL,
  `event_code` varchar(64) NOT NULL,
  `priority` enum('HIGH','LOW','NORMAL','URGENT') DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_event_channel` (`event_code`,`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_subscription_rule`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_subscription_rule` WRITE;
/*!40000 ALTER TABLE `msg_subscription_rule` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_subscription_rule` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_template`
--

DROP TABLE IF EXISTS `msg_template`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_template` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `category` enum('APPROVAL','NOTIFICATION','SYSTEM','TASK','WORKFLOW') DEFAULT NULL,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') DEFAULT NULL,
  `content` text DEFAULT NULL,
  `content_type` enum('MARKDOWN','TEXT') DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `enabled` bit(1) NOT NULL,
  `event_code` varchar(64) DEFAULT NULL,
  `is_system` bit(1) NOT NULL,
  `name` varchar(128) NOT NULL,
  `priority` enum('HIGH','LOW','NORMAL','URGENT') DEFAULT NULL,
  `template_code` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_template` (`tenant_id`,`template_code`),
  KEY `idx_channel` (`channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_template`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_template` WRITE;
/*!40000 ALTER TABLE `msg_template` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_template` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `msg_user_subscription`
--

DROP TABLE IF EXISTS `msg_user_subscription`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `msg_user_subscription` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `channel` enum('APP','IN_APP','SMS','WECHAT_MINIPROGRAM','WECHAT_WORK') NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `subscribed` bit(1) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `user_id` bigint(20) NOT NULL,
  `username` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKsb3us05nvffs56bh1xr5uxjvu` (`tenant_id`,`user_id`,`channel`),
  KEY `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `msg_user_subscription`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `msg_user_subscription` WRITE;
/*!40000 ALTER TABLE `msg_user_subscription` DISABLE KEYS */;
/*!40000 ALTER TABLE `msg_user_subscription` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_attachment`
--

DROP TABLE IF EXISTS `sys_attachment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_attachment` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `file_name` varchar(500) NOT NULL COMMENT '原始文件名（展示用）',
  `stored_name` varchar(128) NOT NULL COMMENT '存储文件名（uuid.ext，服务端生成）',
  `content_type` varchar(255) DEFAULT NULL COMMENT 'MIME 类型',
  `file_size` bigint(20) NOT NULL DEFAULT 0 COMMENT '文件字节数',
  `storage_path` varchar(500) NOT NULL COMMENT '相对 storage-path 的子路径（yyyy/MM/uuid.ext）',
  `biz_type` varchar(50) DEFAULT NULL COMMENT '业务归类（预留：form/page/...）',
  `biz_ref` varchar(64) DEFAULT NULL COMMENT '业务引用标识（预留）',
  `is_deleted` int(11) NOT NULL DEFAULT 0,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `img_width` int(11) DEFAULT NULL COMMENT '图片宽度 px（仅 upload-image 且位图解码成功时有值）',
  `img_height` int(11) DEFAULT NULL COMMENT '图片高度 px（同上）',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_attachment_stored_name` (`stored_name`),
  KEY `idx_sys_attachment_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统组件·附件元数据（Task 146）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_attachment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_attachment` WRITE;
/*!40000 ALTER TABLE `sys_attachment` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_attachment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_dict_data`
--

DROP TABLE IF EXISTS `sys_dict_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_data` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `dict_code` varchar(50) NOT NULL,
  `label` varchar(100) NOT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `value` varchar(100) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_data`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_dict_data` WRITE;
/*!40000 ALTER TABLE `sys_dict_data` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_dict_data` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_dict_type`
--

DROP TABLE IF EXISTS `sys_dict_type`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_dict_type` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `dict_code` varchar(50) NOT NULL,
  `dict_name` varchar(100) NOT NULL,
  `remark` varchar(255) DEFAULT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKn09exsucyqm2v79fwvep1wtn9` (`dict_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_dict_type`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_dict_type` WRITE;
/*!40000 ALTER TABLE `sys_dict_type` DISABLE KEYS */;
/*!40000 ALTER TABLE `sys_dict_type` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_member_group`
--

DROP TABLE IF EXISTS `sys_member_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_member_group` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `group_name` varchar(64) NOT NULL COMMENT '成员组名称',
  `description` varchar(255) DEFAULT NULL COMMENT '说明',
  `status` int(11) NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用',
  `is_deleted` int(11) NOT NULL DEFAULT 0,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sys_member_group_name` (`group_name`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成员组主数据';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_member_group`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_member_group` WRITE;
/*!40000 ALTER TABLE `sys_member_group` DISABLE KEYS */;
INSERT INTO `sys_member_group` VALUES
(1,'项目管理组','项目立项、评审、验收相关流程的审批协同组',1,0,'system','2026-10-09 00:05:46.268000',NULL,'2026-10-09 00:05:46.268000'),
(2,'运维值班组','系统值班与告警处理通知组',1,0,'system','2026-10-09 00:05:46.269000',NULL,'2026-10-09 00:05:46.269000');
/*!40000 ALTER TABLE `sys_member_group` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_member_group_member`
--

DROP TABLE IF EXISTS `sys_member_group_member`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_member_group_member` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `group_id` bigint(20) NOT NULL COMMENT '成员组 id',
  `user_id` bigint(20) NOT NULL COMMENT '用户 id',
  `is_deleted` int(11) NOT NULL DEFAULT 0,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_group_user` (`group_id`,`user_id`),
  KEY `idx_member_group_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='成员组成员关系（手动添加，规则机制已移除）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_member_group_member`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_member_group_member` WRITE;
/*!40000 ALTER TABLE `sys_member_group_member` DISABLE KEYS */;
INSERT INTO `sys_member_group_member` VALUES
(1,1,1,0,'system','2026-10-09 00:05:46.269000','2026-10-09 00:05:46.269000',NULL),
(2,1,2,0,'system','2026-10-09 00:05:46.269000','2026-10-09 00:05:46.269000',NULL);
/*!40000 ALTER TABLE `sys_member_group_member` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_menu`
--

DROP TABLE IF EXISTS `sys_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_menu` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `component` varchar(255) DEFAULT NULL,
  `icon` varchar(50) DEFAULT NULL,
  `menu_name` varchar(100) NOT NULL,
  `menu_type` int(11) NOT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `path` varchar(200) DEFAULT NULL,
  `permission` varchar(100) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=317 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_menu`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_menu` WRITE;
/*!40000 ALTER TABLE `sys_menu` DISABLE KEYS */;
INSERT INTO `sys_menu` VALUES
(1,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,'Setting','系统管理',0,NULL,'/system',NULL,1,1),
(2,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'system/user/index','User','用户管理',1,1,'/system/user','system:user:list',1,1),
(3,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'system/role/index','UserFilled','角色管理',1,1,'/system/role','system:role:list',2,1),
(4,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'system/menu/index','Menu','菜单管理',1,1,'/system/menu','system:menu:list',3,1),
(5,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'system/org/index','Organization','组织机构',1,1,'/system/org','system:org:list',4,1),
(6,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'system/dict/index','List','字典管理',1,1,'/system/dict','system:dict:list',5,1),
(7,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'dashboard/index','HomeFilled','首页',1,NULL,'/dashboard',NULL,0,1),
(8,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'用户查询',2,2,NULL,'system:user:query',1,1),
(9,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'用户新增',2,2,NULL,'system:user:create',2,1),
(10,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'用户修改',2,2,NULL,'system:user:update',3,1),
(11,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'用户删除',2,2,NULL,'system:user:delete',4,1),
(12,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'角色查询',2,3,NULL,'system:role:query',1,1),
(13,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'角色新增',2,3,NULL,'system:role:create',2,1),
(14,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'角色修改',2,3,NULL,'system:role:update',3,1),
(15,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'角色删除',2,3,NULL,'system:role:delete',4,1),
(16,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'菜单查询',2,4,NULL,'system:menu:query',1,1),
(17,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'菜单新增',2,4,NULL,'system:menu:create',2,1),
(18,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'菜单修改',2,4,NULL,'system:menu:update',3,1),
(19,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'菜单删除',2,4,NULL,'system:menu:delete',4,1),
(20,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'机构查询',2,5,NULL,'system:org:query',1,1),
(21,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'机构新增',2,5,NULL,'system:org:create',2,1),
(22,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'机构修改',2,5,NULL,'system:org:update',3,1),
(23,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'机构删除',2,5,NULL,'system:org:delete',4,1),
(24,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'字典查询',2,6,NULL,'system:dict:query',1,1),
(25,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'字典新增',2,6,NULL,'system:dict:create',2,1),
(26,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'字典修改',2,6,NULL,'system:dict:update',3,1),
(27,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'字典删除',2,6,NULL,'system:dict:delete',4,1),
(100,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,'Operation','流程管理',0,NULL,'/process',NULL,2,1),
(101,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'process/ProcessListPage','Document','流程定义',1,100,'/process/definition','process:definition:list',1,1),
(102,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'process/ProcessCenterPage','Files','流程中心',1,100,'/process/center','process:center:list',2,1),
(103,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'process/ProcessTodoPage','BellFilled','待办处理',1,100,'/process/todo','process:todo:list',3,1),
(104,'2026-10-09 00:05:46.249000',NULL,0,'2026-10-09 00:05:46.249000',NULL,'process/ProcessDraftBoxPage','Files','草稿箱',1,100,'/process/drafts','process:drafts:list',4,1),
(110,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'流程创建',2,101,NULL,'process:definition:create',1,1),
(111,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'流程部署',2,101,NULL,'process:definition:deploy',2,1),
(112,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'流程删除',2,101,NULL,'process:definition:delete',3,1),
(113,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'分类创建',2,104,NULL,'process:category:create',1,1),
(114,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'分类编辑',2,104,NULL,'process:category:update',2,1),
(115,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'分类删除',2,104,NULL,'process:category:delete',3,1),
(120,'2026-09-11 10:30:10.000000',NULL,1,'2026-09-11 10:30:10.000000',NULL,NULL,'Tickets','表单管理',0,NULL,'/form',NULL,3,0),
(121,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'form/FormListPage','Document','表单列表',1,160,'/form','form:list',1,1),
(130,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'表单创建',2,121,NULL,'form:create',1,1),
(131,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'表单编辑',2,121,NULL,'form:edit',2,1),
(132,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'表单发布',2,121,NULL,'form:publish',3,1),
(133,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'表单删除',2,121,NULL,'form:delete',4,1),
(140,'2026-09-11 10:30:10.000000',NULL,1,'2026-09-11 10:30:10.000000',NULL,NULL,'Grid','查询界面管理',0,NULL,'/page',NULL,4,0),
(141,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'page/PageListPage','Document','页面列表',1,160,'/page','page:list',1,1),
(142,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'dataSource/DataSourceListPage','Connection','数据源管理',1,160,'/data-source/list','data-source:list',2,1),
(150,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'页面创建',2,141,NULL,'page:create',1,1),
(151,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'页面编辑',2,141,NULL,'page:edit',2,1),
(152,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'页面发布',2,141,NULL,'page:publish',3,1),
(153,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'页面删除',2,141,NULL,'page:delete',4,1),
(154,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'数据源管理',2,142,NULL,'data-source:manage',1,1),
(160,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,'Grid','表单视图管理',0,NULL,'/form',NULL,3,1),
(170,'2026-10-09 00:05:46.301000',NULL,0,'2026-10-09 00:05:46.301000',NULL,NULL,'Share','逻辑编排',0,NULL,'/logic',NULL,4,1),
(171,'2026-10-09 00:05:46.302000',NULL,0,'2026-10-09 00:05:46.302000',NULL,'logicflow/LogicFlowListPage','Cpu','逻辑流',1,170,'/logic-flow','logicflow:list',1,1),
(250,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,'Bell','消息管理',0,NULL,'/messages',NULL,5,1),
(251,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/MessageCenter','Message','消息中心',1,250,'/messages','notification:message:list',1,1),
(252,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/TemplateList','Document','模板管理',1,250,'/messages/templates','notification:template:list',2,1),
(253,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/ChannelConfig','Connection','渠道配置',1,250,'/messages/channels','notification:channel:list',3,1),
(254,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/SubscriptionRules','SetUp','订阅规则',1,250,'/messages/subscriptions','notification:subscription:list',4,1),
(255,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/DeliveryLog','Tickets','发送记录',1,250,'/messages/deliveries','notification:delivery:list',5,1),
(256,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'模板管理',2,252,NULL,'notification:template:manage',1,1),
(257,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'渠道配置',2,253,NULL,'notification:channel:manage',1,1),
(258,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'订阅规则',2,254,NULL,'notification:subscription:manage',1,1),
(259,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'发送记录重发',2,255,NULL,'notification:delivery:retry',1,1),
(260,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/AnnouncementList','Notification','公告管理',1,250,'/messages/announcements','notification:announcement:list',6,1),
(261,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'modules/notification/views/admin/EventDefinitionList','Operation','事件管理',1,250,'/messages/events','notification:event:list',7,1),
(262,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'公告管理',2,260,NULL,'notification:announcement:manage',1,1),
(263,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,NULL,'事件管理',2,261,NULL,'notification:event:manage',1,1),
(300,'2026-10-09 00:05:46.249000',NULL,0,'2026-10-09 00:05:46.249000',NULL,'system/post/PostPage','User','岗位管理',1,1,'/system/post','system:post:list',6,1),
(304,'2026-09-15 18:42:37.587603',NULL,0,'2026-09-15 18:42:37.587603',NULL,'page/PageRenderer',NULL,'演示页面',1,160,'/page/test_page','page:read:test_page',0,1),
(305,'2026-10-09 00:05:46.250000',NULL,0,'2026-10-09 00:05:46.270000',NULL,'system/member-group/MemberGroupPage','Connection','成员组管理',1,1,'/system/member-group','system:member-group:list',7,1),
(306,'2026-10-03 01:29:54.395845',NULL,0,'2026-10-03 01:29:54.395861',NULL,'page/PageRenderer',NULL,'主页仪表盘',1,NULL,'/page/dashboard','page:read:dashboard',0,1),
(312,'2026-10-09 00:05:46.270000',NULL,0,'2026-10-09 00:05:46.270000',NULL,NULL,NULL,'成员组查询',2,305,NULL,'system:member-group:query',1,1),
(313,'2026-10-09 00:05:46.270000',NULL,0,'2026-10-09 00:05:46.270000',NULL,NULL,NULL,'成员组新增',2,305,NULL,'system:member-group:create',2,1),
(314,'2026-10-09 00:05:46.270000',NULL,0,'2026-10-09 00:05:46.270000',NULL,NULL,NULL,'成员组修改',2,305,NULL,'system:member-group:update',3,1),
(315,'2026-10-09 00:05:46.271000',NULL,0,'2026-10-09 00:05:46.271000',NULL,NULL,NULL,'成员组删除',2,305,NULL,'system:member-group:delete',4,1),
(316,'2026-10-09 00:05:46.271000',NULL,0,'2026-10-09 00:05:46.271000',NULL,NULL,NULL,'成员维护',2,305,NULL,'system:member-group:member',5,1);
/*!40000 ALTER TABLE `sys_menu` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_organization`
--

DROP TABLE IF EXISTS `sys_organization`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_organization` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `org_code` varchar(50) NOT NULL,
  `org_name` varchar(100) NOT NULL,
  `parent_id` bigint(20) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `status` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK1dm1ss9gn66mtn1m0dyb9bsyp` (`org_code`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_organization`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_organization` WRITE;
/*!40000 ALTER TABLE `sys_organization` DISABLE KEYS */;
INSERT INTO `sys_organization` VALUES
(1,'2026-09-11 14:56:10.024480',NULL,0,'2026-09-11 14:56:10.024480',NULL,'01','总公司',NULL,0,1),
(2,'2026-09-11 14:56:39.609039',NULL,0,'2026-09-11 14:56:39.609039',NULL,'0101','武汉分公司',1,1,1),
(3,'2026-09-11 14:57:09.187390',NULL,0,'2026-09-11 14:57:09.187390',NULL,'0102','北京分公司',1,2,1),
(4,'2026-09-11 14:57:40.732142',NULL,0,'2026-09-11 15:19:18.297269',NULL,'0103','海南分公司',1,3,1);
/*!40000 ALTER TABLE `sys_organization` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_post`
--

DROP TABLE IF EXISTS `sys_post`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_post` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `post_code` varchar(64) NOT NULL COMMENT '岗位编码（唯一）',
  `post_name` varchar(64) NOT NULL,
  `description` varchar(255) DEFAULT NULL COMMENT '描述',
  `sort_order` int(11) DEFAULT NULL COMMENT '排序',
  `status` int(11) NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用',
  `is_deleted` int(11) NOT NULL DEFAULT 0,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_post_code` (`post_code`),
  UNIQUE KEY `uk_sys_post_code` (`post_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='岗位主数据';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_post`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_post` WRITE;
/*!40000 ALTER TABLE `sys_post` DISABLE KEYS */;
INSERT INTO `sys_post` VALUES
(1,'GM','总经理','公司总经理岗位',1,1,0,NULL,'2026-10-09 00:05:46.246000',NULL,'2026-10-09 00:05:46.246000'),
(2,'HR_MGR','人事经理','人事部经理岗位',2,1,0,NULL,'2026-10-09 00:05:46.248000',NULL,'2026-10-09 00:05:46.248000');
/*!40000 ALTER TABLE `sys_post` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_role`
--

DROP TABLE IF EXISTS `sys_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `role_code` varchar(50) NOT NULL,
  `role_name` varchar(100) NOT NULL,
  `status` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKjqdita2l45v2gglry7bp8kl1f` (`role_code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_role` WRITE;
/*!40000 ALTER TABLE `sys_role` DISABLE KEYS */;
INSERT INTO `sys_role` VALUES
(1,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'系统超级管理员','ROLE_ADMIN','超级管理员',1),
(2,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,'系统普通用户','ROLE_USER','普通用户',1);
/*!40000 ALTER TABLE `sys_role` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_role_menu`
--

DROP TABLE IF EXISTS `sys_role_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_role_menu` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `menu_id` bigint(20) NOT NULL,
  `role_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=101 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_role_menu`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_role_menu` WRITE;
/*!40000 ALTER TABLE `sys_role_menu` DISABLE KEYS */;
INSERT INTO `sys_role_menu` VALUES
(1,1,1),
(2,2,1),
(3,3,1),
(4,4,1),
(5,5,1),
(6,6,1),
(7,7,1),
(8,8,1),
(9,9,1),
(10,10,1),
(11,11,1),
(12,12,1),
(13,13,1),
(14,14,1),
(15,15,1),
(16,16,1),
(17,17,1),
(18,18,1),
(19,19,1),
(20,20,1),
(21,21,1),
(22,22,1),
(23,23,1),
(24,24,1),
(25,25,1),
(26,26,1),
(27,27,1),
(32,100,1),
(33,101,1),
(34,102,1),
(35,103,1),
(36,110,1),
(37,111,1),
(38,112,1),
(39,120,1),
(40,121,1),
(41,130,1),
(42,131,1),
(43,132,1),
(44,133,1),
(46,113,1),
(47,114,1),
(48,115,1),
(49,140,1),
(50,141,1),
(51,142,1),
(52,150,1),
(53,151,1),
(54,152,1),
(55,153,1),
(56,154,1),
(64,160,1),
(65,250,1),
(66,251,1),
(67,252,1),
(68,253,1),
(69,254,1),
(70,255,1),
(71,256,1),
(72,257,1),
(73,258,1),
(74,259,1),
(80,260,1),
(81,261,1),
(82,262,1),
(83,263,1),
(87,304,1),
(88,104,1),
(89,300,1),
(90,305,1),
(91,312,1),
(92,313,1),
(93,314,1),
(94,315,1),
(95,316,1),
(98,170,1),
(99,171,1),
(100,306,1);
/*!40000 ALTER TABLE `sys_role_menu` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_user`
--

DROP TABLE IF EXISTS `sys_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `is_deleted` int(11) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `updated_by` varchar(50) DEFAULT NULL,
  `avatar` varchar(255) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `nickname` varchar(50) DEFAULT NULL,
  `org_id` bigint(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `post_id` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK51bvuyvihefoh4kp5syh2jpi4` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_user` WRITE;
/*!40000 ALTER TABLE `sys_user` DISABLE KEYS */;
INSERT INTO `sys_user` VALUES
(1,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,'admin@workflow.com','管理员',NULL,'$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2',NULL,1,'admin',NULL),
(2,'2026-09-11 10:30:10.000000',NULL,0,'2026-09-11 10:30:10.000000',NULL,NULL,'test@workflow.com','测试用户',NULL,'$2a$10$7JB720yubVSZvUI0rEqK/.VqGOZTH.ulu33dHOiBE8ByOhJIrdAu2',NULL,1,'test',NULL);
/*!40000 ALTER TABLE `sys_user` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `sys_user_role`
--

DROP TABLE IF EXISTS `sys_user_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `sys_user_role` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `role_id` bigint(20) NOT NULL,
  `user_id` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FKhh52n8vd4ny9ff4x9fb8v65qx` (`role_id`),
  KEY `FKb40xxfch70f5qnyfw8yme1n1s` (`user_id`),
  CONSTRAINT `FKb40xxfch70f5qnyfw8yme1n1s` FOREIGN KEY (`user_id`) REFERENCES `sys_user` (`id`),
  CONSTRAINT `FKhh52n8vd4ny9ff4x9fb8v65qx` FOREIGN KEY (`role_id`) REFERENCES `sys_role` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sys_user_role`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `sys_user_role` WRITE;
/*!40000 ALTER TABLE `sys_user_role` DISABLE KEYS */;
INSERT INTO `sys_user_role` VALUES
(1,1,1),
(2,2,2);
/*!40000 ALTER TABLE `sys_user_role` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf4tjek39`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf4tjek39`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf4tjek39` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `department` varchar(255) DEFAULT NULL,
  `leave_type` varchar(255) DEFAULT NULL,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf4tjek39`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf4tjek39` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf4tjek39` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf4tjek39` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf52ksu88`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf52ksu88`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf52ksu88` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `item_name` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` int(11) NOT NULL,
  `registration_date` date NOT NULL,
  `remarks` text DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf52ksu88`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf52ksu88` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf52ksu88` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf52ksu88` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_ai_muf58a5n38`
--

DROP TABLE IF EXISTS `wf_biz_ai_muf58a5n38`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_ai_muf58a5n38` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `applicant_name` varchar(255) NOT NULL,
  `department` varchar(255) NOT NULL,
  `reimbursement_type` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`reimbursement_type`)),
  `details` text DEFAULT NULL,
  `amount` int(11) NOT NULL,
  `attachment` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `reimbursement_type_text` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_ai_muf58a5n38`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_ai_muf58a5n38` WRITE;
/*!40000 ALTER TABLE `wf_biz_ai_muf58a5n38` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_ai_muf58a5n38` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_bill_test`
--

DROP TABLE IF EXISTS `wf_biz_bill_test`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_bill_test` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `person_id` varchar(255) DEFAULT NULL,
  `person_name` varchar(255) DEFAULT NULL,
  `department` varchar(255) NOT NULL,
  `position` varchar(255) NOT NULL,
  `leave_start_date` date NOT NULL,
  `leave_end_date` date NOT NULL,
  `leave_type` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`leave_type`)),
  `leave_type_text` varchar(255) DEFAULT NULL,
  `leave_days` int(11) NOT NULL,
  `leave_reason` text NOT NULL,
  `contact_phone` varchar(255) NOT NULL,
  `is_approved` varchar(255) NOT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_bill_test`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_bill_test` WRITE;
/*!40000 ALTER TABLE `wf_biz_bill_test` DISABLE KEYS */;
INSERT INTO `wf_biz_bill_test` VALUES
('78459b7180f6a44e562616c0f741a907','default','1','admin','1','1','2026-09-25','2026-09-25','\"personal\"','事假',1,'1','1','yes',1,NULL,NULL,NULL);
/*!40000 ALTER TABLE `wf_biz_bill_test` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_e2enew_task`
--

DROP TABLE IF EXISTS `wf_biz_e2enew_task`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_e2enew_task` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `person_name` varchar(64) DEFAULT NULL,
  `amount` decimal(18,2) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_e2enew_task`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_e2enew_task` WRITE;
/*!40000 ALTER TABLE `wf_biz_e2enew_task` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_biz_e2enew_task` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_leave_apply_biz`
--

DROP TABLE IF EXISTS `wf_biz_leave_apply_biz`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_leave_apply_biz` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `leave_type` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`leave_type`)),
  `leave_type_text` varchar(255) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_leave_apply_biz`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_leave_apply_biz` WRITE;
/*!40000 ALTER TABLE `wf_biz_leave_apply_biz` DISABLE KEYS */;
INSERT INTO `wf_biz_leave_apply_biz` VALUES
('988c251ce5874da3b851b6a247bfbb7b','default','1','选项01','请假原因','7567d2a6c0f843b990c0d59b609453f2','张三',5,NULL,NULL,'2026-09-11 19:46:54');
/*!40000 ALTER TABLE `wf_biz_leave_apply_biz` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_biz_person`
--

DROP TABLE IF EXISTS `wf_biz_person`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_biz_person` (
  `id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `code` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `dept` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`dept`)),
  `dept_text` varchar(255) DEFAULT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `created_by` varchar(50) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_person_code` (`tenant_id`,`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_biz_person`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_biz_person` WRITE;
/*!40000 ALTER TABLE `wf_biz_person` DISABLE KEYS */;
INSERT INTO `wf_biz_person` VALUES
('7567d2a6c0f843b990c0d59b609453f2','default','001','张三','[\"2\"]','/总公司/武汉分公司',2,NULL,NULL,'2026-09-11 15:20:06');
/*!40000 ALTER TABLE `wf_biz_person` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_category`
--

DROP TABLE IF EXISTS `wf_category`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_category` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `parent_id` varchar(64) DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_category`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_category` WRITE;
/*!40000 ALTER TABLE `wf_category` DISABLE KEYS */;
INSERT INTO `wf_category` VALUES
('0c0d3ea69e8645778e9da2c9d6c1a735','2026-09-11 10:38:22.330141','报销流程',NULL,2,'default'),
('64f4802b34e352e3da0d7aeb9fa71de2','2026-09-24 08:44:04.000000','请假流程',NULL,1,'default'),
('9fc5266c8e07a5ac9adf80494049bbe2','2026-09-24 08:44:17.000000','报销流程',NULL,2,'default'),
('abbde8e4a6f74009a8a595bb7c38973c','2026-09-11 10:37:54.924715','考勤相关',NULL,1,'default'),
('e7f4b9b29f9a47c388875bc6c007dd11','2026-09-11 10:37:39.432598','常用流程',NULL,0,'default');
/*!40000 ALTER TABLE `wf_category` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_data_source`
--

DROP TABLE IF EXISTS `wf_data_source`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_data_source` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `form_id` varchar(64) DEFAULT NULL,
  `form_key` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `params` longtext DEFAULT NULL,
  `source_key` varchar(255) DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `type` varchar(32) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ds_tenant_name` (`tenant_id`,`name`),
  UNIQUE KEY `uk_ds_tenant_source_key` (`tenant_id`,`source_key`),
  KEY `idx_ds_tenant_type` (`tenant_id`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_data_source`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_data_source` WRITE;
/*!40000 ALTER TABLE `wf_data_source` DISABLE KEYS */;
INSERT INTO `wf_data_source` VALUES
('089688bb7ce443e1a9ab56b7b62ab27d','2026-09-27 00:48:10.000000','system','299f7fcdfde04c309f8339772f44b604','ai_muimil5t78','费用报销审批流程表单 数据源',NULL,'ai_muimil5t78','ENABLED','default','WORKFLOW','2026-09-27 00:48:10.000000'),
('12cc1853648942ea8608dd53b4f43ee2','2026-09-24 13:05:27.000000','system','8a1c28f22312b38ba4414914e6b504cf','ai_xiaozhi_test','AI小智测试表单 数据源',NULL,'ai_xiaozhi_test','ENABLED','default','WORKFLOW','2026-09-24 13:05:27.000000'),
('1cc15d6e514842869f324fb13da0d9ce','2026-09-24 14:16:31.000000','system','9e24468dbcf5e57cdeeddcc7934e629f','ai_muf52ksu88','办公用品登记业务表单 数据源','{\"list\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88\",\"method\":\"GET\",\"parse\":\"records\",\"totalParse\":\"total\"},\"create\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88\",\"method\":\"POST\"},\"get\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"GET\"},\"update\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"PUT\"},\"delete\":{\"action\":\"/api/v1/biz-data/ai_muf52ksu88/{id}\",\"method\":\"DELETE\"}}','ai_muf52ksu88','ENABLED','default','FORM','2026-09-25 02:05:14.000000'),
('20f476f047ca4386bfd1365ea5516832','2026-09-11 14:51:23.835660','system','2c229e1269c74446950c2e8d5ce0dd0f','person','请假人员 数据源',NULL,'person','ENABLED','default','FORM','2026-09-11 14:51:23.835660'),
('3f014ac986314285ae2216bd24dc433e','2026-09-27 00:52:03.000000','system','e13dba23da7ce03c664dc626db550605','ai_muimnle734','办公用品领用流程表单 数据源',NULL,'ai_muimnle734','ENABLED','default','WORKFLOW','2026-09-27 00:52:03.000000'),
('40dae5b2311f4be9a4379a3022e23a52','2026-09-24 14:36:33.000000','system','648b850b40637d18d6dcdd90211a84fb','ai_muf5sckj12','会议室预约业务表单 数据源',NULL,'ai_muf5sckj12','ENABLED','default','FORM','2026-09-24 15:01:37.000000'),
('50613845c2674d1e9037b6986a6c163c','2026-09-27 00:51:01.000000','system','088678179269fbc56c5c157386ccbbb3','ai_muimm9du49','出差申请审批流程表单 数据源',NULL,'ai_muimm9du49','ENABLED','default','WORKFLOW','2026-09-27 00:51:01.000000'),
('869f98e37736434e9e1d551dac877628','2026-09-27 00:43:12.000000','system','73fc3be4d32a2d1b704f022eb61d1f99','ai_muimc7p374','员工请假审批流程表单 数据源',NULL,'ai_muimc7p374','ENABLED','default','WORKFLOW','2026-09-27 00:43:12.000000'),
('91ec520d8f484b68b9307398fe2e15c0','2026-09-24 14:20:57.000000','system','579351c3534ce256077a37b017b91430','ai_muf58a5n38','员工报销申请 数据源',NULL,'ai_muf58a5n38','ENABLED','default','FORM','2026-09-24 15:00:55.000000'),
('a56b4b818d064127bd431c24ef90b03a','2026-09-11 10:49:28.260468','system','3761079572ed48158ccd31159a3ac7ae','leave_apply_biz','请假单-业务表单 数据源','{\"queryMode\":\"config\",\"joins\":[{\"alias\":\"j1\",\"targetFormKey\":\"person\",\"localField\":\"user_id\",\"foreignField\":\"id\",\"joinField\":\"name\",\"virtualKey\":\"leave_name\",\"label\":\"姓名-请假人\",\"sortable\":true,\"filterable\":true},{\"targetFormKey\":\"person\",\"localField\":\"user_id\",\"foreignField\":\"id\",\"joinField\":\"dept\",\"virtualKey\":\"leave_dept\",\"label\":\"部门-请假人\",\"sortable\":true,\"filterable\":true}]}','leave_apply_biz','ENABLED','default','FORM','2026-09-11 19:23:44.936285'),
('a9d5b0d6f0274d19b6f39937175620c3','2026-09-15 19:02:45.648946','system','dadf29ae8b54497eaa0d64447e87bbf6','baoxiaodan','报销单 数据源',NULL,'baoxiaodan','ENABLED','default','WORKFLOW','2026-09-15 19:02:45.648946'),
('c720ba08c39a42a4a05ec7a788bc2021','2026-10-10 05:43:33.613040','system','ddd182b016194949ab15e81a0dceea51','e2enew_task','新节点E2E临时表单 数据源',NULL,'e2enew_task','ENABLED','default','FORM','2026-10-10 05:43:33.613052'),
('cc78ce9ddc784f04ba4b8871285e5779','2026-09-24 15:33:58.000000','system','e6d2ffd44a6baf0d26f10a99d656c705','ai_muf7u70h84','会议室预约表单 数据源',NULL,'ai_muf7u70h84','ENABLED','default','FORM','2026-09-24 15:33:58.000000'),
('dda21b336e3d444d9370aa881316106b','2026-09-24 14:09:29.000000','system','e6ab86607aca0f4dce285f108687f67a','ai_muf4tjek39','员工请假业务表单 数据源',NULL,'ai_muf4tjek39','ENABLED','default','FORM','2026-09-24 15:26:21.000000'),
('ds-builtin-dept-tree','2026-10-09 00:05:46.000000','system',NULL,NULL,'组织机构','{\"list\":{\"action\":\"/api/v1/internal/system/dept-tree\",\"method\":\"GET\"}}','dept-tree','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-process-definitions','2026-10-09 00:05:46.000000','system',NULL,NULL,'流程定义','{\"list\":{\"action\":\"/api/v1/internal/system/process/definitions\",\"method\":\"GET\"}}','process-definitions','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-process-instances','2026-10-09 00:05:46.000000','system',NULL,NULL,'流程实例','{\"list\":{\"action\":\"/api/v1/internal/system/process/instances\",\"method\":\"GET\"}}','process-instances','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-sys-dicts','2026-10-09 00:05:46.000000','system',NULL,NULL,'系统字典','{\"list\":{\"action\":\"/api/v1/internal/system/dicts\",\"method\":\"GET\"}}','sys-dicts','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-sys-menus','2026-10-09 00:05:46.000000','system',NULL,NULL,'系统菜单','{\"list\":{\"action\":\"/api/v1/internal/system/menus\",\"method\":\"GET\"}}','sys-menus','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-sys-posts','2026-10-09 00:05:46.000000','system',NULL,NULL,'系统岗位','{\"list\":{\"action\":\"/api/v1/internal/system/posts\",\"method\":\"GET\"}}','sys-posts','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-sys-roles','2026-10-09 00:05:46.000000','system',NULL,NULL,'系统角色','{\"list\":{\"action\":\"/api/v1/internal/system/roles\",\"method\":\"GET\"}}','sys-roles','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-todo-tasks','2026-10-09 00:05:46.000000','system',NULL,NULL,'待办任务','{\"list\":{\"action\":\"/api/v1/internal/system/process/todo-tasks\",\"method\":\"GET\"}}','todo-tasks','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('ds-builtin-user-tree','2026-10-09 00:05:46.000000','system',NULL,NULL,'系统用户','{\"list\":{\"action\":\"/api/v1/internal/system/users\",\"method\":\"GET\"}}','user-tree','ENABLED','system','SYSTEM','2026-10-09 00:05:46.000000'),
('e6741228ebda42fb8fa0c5717800d27a','2026-09-24 00:23:43.000000','system','9dc27e83b084a95bb4230f60fd92bc34','bill_test','测试表单 数据源','{\"list\":{\"action\":\"/api/v1/biz-data/bill_test\",\"method\":\"GET\",\"parse\":\"records\",\"totalParse\":\"total\"},\"create\":{\"action\":\"/api/v1/biz-data/bill_test\",\"method\":\"POST\"},\"get\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"GET\"},\"update\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"PUT\"},\"delete\":{\"action\":\"/api/v1/biz-data/bill_test/{id}\",\"method\":\"DELETE\"},\"queryMode\":\"config\",\"joins\":[{\"targetFormKey\":\"user-tree\",\"localField\":\"person_id\",\"foreignField\":\"id\",\"joinField\":\"username\",\"virtualKey\":\"apply_name\",\"label\":\"申请人姓名\",\"sortable\":true,\"filterable\":true}]}','bill_test','ENABLED','default','FORM','2026-09-25 08:19:04.000000');
/*!40000 ALTER TABLE `wf_data_source` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_engine_notify`
--

DROP TABLE IF EXISTS `wf_engine_notify`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_engine_notify` (
  `id` varchar(64) NOT NULL COMMENT 'UUID',
  `tenant_id` varchar(64) NOT NULL DEFAULT 'default' COMMENT '租户 ID',
  `instance_id` varchar(64) NOT NULL COMMENT '流程实例 ID',
  `task_id` varchar(64) DEFAULT NULL COMMENT '关联任务 ID（实例级通知为 NULL）',
  `notify_type` varchar(32) NOT NULL COMMENT '通知类型：SMS_NODE/SMS_END/TIMEOUT_REMIND',
  `target_user` varchar(64) NOT NULL COMMENT '目标用户 ID',
  `content` varchar(500) NOT NULL COMMENT '通知内容',
  `status` varchar(16) NOT NULL DEFAULT 'PENDING' COMMENT '发送状态：PENDING/SENT/FAILED',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_engine_notify_instance` (`instance_id`),
  KEY `idx_engine_notify_target` (`target_user`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='引擎外发通知记录';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_engine_notify`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_engine_notify` WRITE;
/*!40000 ALTER TABLE `wf_engine_notify` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_engine_notify` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_form_data`
--

DROP TABLE IF EXISTS `wf_form_data`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_form_data` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `data_json` longtext DEFAULT NULL,
  `form_def_id` varchar(64) NOT NULL,
  `form_version` int(11) NOT NULL,
  `is_snapshot` bit(1) NOT NULL,
  `process_instance_id` varchar(64) DEFAULT NULL,
  `task_id` varchar(64) DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_form_data_def_proc` (`form_def_id`,`process_instance_id`),
  KEY `idx_form_data_tenant_proc` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_form_data`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_form_data` WRITE;
/*!40000 ALTER TABLE `wf_form_data` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_form_data` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_form_def`
--

DROP TABLE IF EXISTS `wf_form_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_form_def` (
  `id` varchar(64) NOT NULL,
  `column_config` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`column_config`)),
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `key` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `process_key` varchar(64) DEFAULT NULL,
  `published_version` int(11) DEFAULT NULL,
  `schema` longtext DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `type` varchar(20) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `version` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_def_tenant_key_version` (`tenant_id`,`key`,`version`),
  KEY `idx_form_def_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_form_def`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_form_def` WRITE;
/*!40000 ALTER TABLE `wf_form_def` DISABLE KEYS */;
INSERT INTO `wf_form_def` VALUES
('2c229e1269c74446950c2e8d5ce0dd0f','[{\"key\": \"code\", \"label\": \"人员编码\", \"scale\": null, \"length\": 255, \"unique\": true, \"indexed\": false, \"required\": true, \"columnType\": \"VARCHAR\", \"componentType\": \"input\"}, {\"key\": \"name\", \"label\": \"人员姓名\", \"scale\": null, \"length\": 255, \"unique\": false, \"indexed\": false, \"required\": true, \"columnType\": \"VARCHAR\", \"componentType\": \"input\"}, {\"key\": \"dept\", \"label\": \"所属部门\", \"scale\": null, \"length\": null, \"unique\": false, \"indexed\": false, \"required\": false, \"columnType\": \"JSON\", \"componentType\": \"elTreeSelect\"}, {\"key\": \"dept_text\", \"label\": \"所属部门（显示）\", \"scale\": null, \"hidden\": true, \"length\": 255, \"unique\": false, \"indexed\": false, \"required\": false, \"columnType\": \"VARCHAR\", \"componentType\": \"elTreeSelectText\"}]','2026-09-11 14:47:27.076157',NULL,'person','请假人员',NULL,1,'{\"rule\":[{\"type\":\"input\",\"field\":\"code\",\"title\":\"人员编码\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_F5xsmtwlgfp0afc\",\"name\":\"ref_Fh05mtwlgfp0agc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"input\"},{\"type\":\"input\",\"field\":\"name\",\"title\":\"人员姓名\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_Fmscmtwlgdfgacc\",\"name\":\"ref_Fgksmtwlgdfgadc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"input\"},{\"type\":\"elTreeSelect\",\"field\":\"dept\",\"title\":\"所属部门\",\"info\":\"\",\"effect\":{\"fetch\":\"\",\"datasource\":{\"dataSourceId\":\"ds_mtwljll5\",\"labelField\":\"label\",\"valueField\":\"id\",\"parentField\":\"parentId\"}},\"$required\":false,\"props\":{\"nodeKey\":\"value\",\"showCheckbox\":true,\"_optionType\":6},\"_fc_id\":\"id_F27smtwliv68aoc\",\"name\":\"ref_F44gmtwliv68apc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"elTreeSelect\"}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"请假人员\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"}},\"dataSources\":[{\"id\":\"ds_mtwljll5\",\"refId\":\"67043fe7960b4b2098e88b69330c8b62\",\"name\":\"部门树数据源\"}],\"actions\":[]}','PUBLISHED','default','BUSINESS','2026-09-11 14:51:23.835660',1),
('3761079572ed48158ccd31159a3ac7ae','[{\"key\": \"leave_type\", \"label\": \"请假类别\", \"scale\": null, \"length\": null, \"unique\": false, \"indexed\": false, \"required\": false, \"columnType\": \"JSON\", \"componentType\": \"select\"}, {\"key\": \"leave_type_text\", \"label\": \"请假类别（显示）\", \"scale\": null, \"hidden\": true, \"length\": 255, \"unique\": false, \"indexed\": false, \"required\": false, \"columnType\": \"VARCHAR\", \"componentType\": \"selectText\"}, {\"key\": \"reason\", \"label\": \"请假原因\", \"scale\": null, \"length\": 255, \"unique\": false, \"indexed\": false, \"required\": false, \"columnType\": \"VARCHAR\", \"componentType\": \"input\"}, {\"key\": \"user_id\", \"label\": \"人员ID\", \"scale\": null, \"hidden\": true, \"length\": 255, \"unique\": false, \"indexed\": false, \"required\": false, \"columnType\": \"VARCHAR\", \"componentType\": \"input\"}, {\"key\": \"name\", \"label\": \"人员姓名\", \"scale\": null, \"length\": 255, \"unique\": false, \"indexed\": false, \"required\": false, \"columnType\": \"VARCHAR\", \"pickerConfig\": \"{\\\"displayField\\\":\\\"name\\\",\\\"mode\\\":\\\"single\\\",\\\"pickerType\\\":\\\"lookupPicker\\\"}\", \"componentType\": \"LookupPicker\"}]','2026-09-11 10:49:28.254947',NULL,'leave_apply_biz','请假单-业务表单',NULL,1,'{\"rule\":[{\"type\":\"select\",\"field\":\"leave_type\",\"title\":\"请假类别\",\"info\":\"\",\"effect\":{\"fetch\":\"\"},\"$required\":false,\"options\":[{\"label\":\"选项01\",\"value\":\"1\"},{\"label\":\"选项02\",\"value\":\"2\"},{\"label\":\"选项03\",\"value\":\"3\"}],\"_fc_id\":\"id_Faawmtwd2avoafc\",\"name\":\"ref_F6g2mtwd2avoagc\",\"_fc_drag_tag\":\"select\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"reason\",\"title\":\"请假原因\",\"info\":\"\",\"$required\":false,\"props\":{\"type\":\"textarea\"},\"_fc_id\":\"id_F932mtwd28i3acc\",\"name\":\"ref_Fy91mtwd28i3adc\",\"_fc_drag_tag\":\"textarea\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"user_id\",\"title\":\"人员ID\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_F39bmtwd4wr8akc\",\"name\":\"ref_F2vxmtwd4wr8alc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":true},{\"type\":\"LookupPicker\",\"field\":\"name\",\"title\":\"人员姓名\",\"props\":{\"columns\":[{\"prop\":\"code\",\"label\":\"人员编码\"},{\"prop\":\"name\",\"label\":\"人员姓名\"},{\"prop\":\"dept\",\"label\":\"所属部门\"}],\"returnFields\":{\"id\":\"user_id\",\"name\":\"name\"},\"dataSourceId\":\"ds_mtwlm13u\",\"displayField\":\"name\",\"searchColumns\":[\"name\",\"dept\"],\"idField\":\"user_id\"},\"_fc_id\":\"id_F0ofmtwd4iyoahc\",\"name\":\"ref_Foismtwd4iyoaic\",\"_fc_drag_tag\":\"LookupPicker\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"请假单-业务表单\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"},\"formName\":\"请假单-业务表单\"},\"dataSources\":[{\"id\":\"ds_mtwlm13u\",\"refId\":\"20f476f047ca4386bfd1365ea5516832\",\"name\":\"请假人员 数据源\"}],\"actions\":[]}','PUBLISHED','default','BUSINESS','2026-09-11 19:45:52.904046',1),
('579351c3534ce256077a37b017b91430','[{\"key\":\"applicant_name\",\"label\":\"报销人姓名\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"department\",\"label\":\"部门\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"reimbursement_type\",\"label\":\"报销类型\",\"columnType\":\"JSON\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"select\"},{\"key\":\"reimbursement_type_text\",\"label\":\"报销类型（显示）\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":true,\"componentType\":\"selectText\"},{\"key\":\"amount\",\"label\":\"金额\",\"columnType\":\"INT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"inputNumber\"},{\"key\":\"attachment\",\"label\":\"附件\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"}]','2026-09-24 14:20:57.000000',NULL,'ai_muf58a5n38','员工报销申请',NULL,1,'{\"rule\":[{\"type\":\"input\",\"field\":\"applicant_name\",\"title\":\"报销人姓名\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写报销人姓名\"}],\"_fc_id\":\"id_F1jcmuf6lj9hc1c\",\"name\":\"ref_Fwjdmuf6lj9hc2c\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"department\",\"title\":\"部门\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写部门\"}],\"_fc_id\":\"id_Fv2lmuf6lj9hc3c\",\"name\":\"ref_F40ymuf6lj9hc4c\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"select\",\"field\":\"reimbursement_type\",\"title\":\"报销类型\",\"value\":null,\"options\":[{\"label\":\"差旅费\",\"value\":\"差旅费\"},{\"label\":\"办公费\",\"value\":\"办公费\"},{\"label\":\"招待费\",\"value\":\"招待费\"},{\"label\":\"其他\",\"value\":\"其他\"}],\"validate\":[{\"required\":true,\"message\":\"请选择报销类型\",\"mode\":\"required\"}],\"_fc_id\":\"id_Fzhcmuf6lj9hc5c\",\"name\":\"ref_F7evmuf6lj9hc6c\",\"_fc_drag_tag\":\"select\",\"display\":true,\"hidden\":false},{\"type\":\"inputNumber\",\"field\":\"amount\",\"title\":\"金额\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写金额\"}],\"_fc_id\":\"id_F8ztmuf6lj9ic9c\",\"name\":\"ref_F7bsmuf6lj9icac\",\"_fc_drag_tag\":\"inputNumber\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"attachment\",\"title\":\"附件\",\"value\":null,\"_fc_id\":\"id_F0y9muf6lj9icbc\",\"name\":\"ref_Fx8ymuf6lj9iccc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"员工报销申请\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"},\"formName\":\"员工报销申请\"},\"dataSources\":[],\"actions\":[]}','PUBLISHED','default','BUSINESS','2026-09-24 15:00:55.000000',1),
('648b850b40637d18d6dcdd90211a84fb','[{\"key\":\"meeting_room_name\",\"label\":\"会议室名称\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"booker_name\",\"label\":\"预约人\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"booking_date\",\"label\":\"预约日期\",\"columnType\":\"DATETIME\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"date\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"purpose\",\"label\":\"使用事由\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"inputTextarea\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null}]','2026-09-24 14:36:33.000000',NULL,'ai_muf5sckj12','会议室预约业务表单',NULL,NULL,'{\"rule\":[{\"type\":\"input\",\"field\":\"meeting_room_name\",\"title\":\"会议室名称\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写会议室名称\",\"mode\":\"required\"}],\"_fc_id\":\"id_F9fymuf6nsmxcec\",\"name\":\"ref_F5v8muf6nsmxcfc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"input\"},{\"type\":\"input\",\"field\":\"booker_name\",\"title\":\"预约人\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写预约人\",\"mode\":\"required\"}],\"_fc_id\":\"id_Fy0jmuf6nsmycgc\",\"name\":\"ref_Fcwwmuf6nsmychc\",\"display\":true,\"hidden\":false,\"_fc_drag_tag\":\"input\"}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"会议室预约业务表单\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"}},\"dataSources\":[],\"actions\":[]}','DRAFT','default','BUSINESS','2026-09-24 15:01:37.000000',1),
('8a1c28f22312b38ba4414914e6b504cf',NULL,'2026-09-24 13:05:27.000000',NULL,'ai_xiaozhi_test','AI小智测试表单',NULL,NULL,'[]','DRAFT','default','WORKFLOW','2026-09-24 13:05:27.000000',1),
('9d2130c4f642deab4f27f09cbede4a9a',NULL,'2026-09-24 10:46:07.000000',NULL,'','暗色测试表单',NULL,NULL,'[]','ARCHIVED','default','WORKFLOW','2026-09-24 11:00:58.000000',1),
('9dc27e83b084a95bb4230f60fd92bc34','[{\"key\":\"person_id\",\"label\":\"请假人id\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\",\"hidden\":true},{\"key\":\"person_name\",\"label\":\"请假人姓名\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"LookupPicker\",\"pickerConfig\":\"{\\\"displayField\\\":\\\"username\\\",\\\"mode\\\":\\\"single\\\",\\\"pickerType\\\":\\\"lookupPicker\\\"}\"},{\"key\":\"department\",\"label\":\"所属部门\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"position\",\"label\":\"职位\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"leave_start_date\",\"label\":\"请假开始日期\",\"columnType\":\"DATE\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"datePicker\"},{\"key\":\"leave_end_date\",\"label\":\"请假结束日期\",\"columnType\":\"DATE\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"datePicker\"},{\"key\":\"leave_type\",\"label\":\"请假类型\",\"columnType\":\"JSON\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"select\"},{\"key\":\"leave_type_text\",\"label\":\"请假类型（显示）\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":true,\"componentType\":\"selectText\"},{\"key\":\"leave_days\",\"label\":\"请假天数\",\"columnType\":\"INT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"inputNumber\"},{\"key\":\"leave_reason\",\"label\":\"请假事由\",\"columnType\":\"TEXT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"textarea\"},{\"key\":\"contact_phone\",\"label\":\"紧急联系电话\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"is_approved\",\"label\":\"是否已获得主管批准\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"radio\"}]','2026-09-24 00:23:43.000000',NULL,'bill_test','测试表单',NULL,1,'{\"rule\":[{\"type\":\"input\",\"field\":\"person_id\",\"title\":\"请假人id\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_F5d7muf892qxayc\",\"name\":\"ref_Fa9tmuf892qxazc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":true},{\"type\":\"LookupPicker\",\"field\":\"person_name\",\"title\":\"请假人姓名\",\"props\":{\"columns\":[{\"prop\":\"username\",\"label\":\"用户名\"}],\"returnFields\":{},\"dataSourceId\":\"ds_mufbo50u\",\"displayField\":\"username\",\"searchColumns\":[\"username\",\"nickname\"],\"idField\":\"person_id\"},\"_fc_id\":\"id_Ftakmuf87tulavc\",\"name\":\"ref_F5xqmuf87tulawc\",\"_fc_drag_tag\":\"LookupPicker\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"department\",\"title\":\"所属部门\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写所属部门\"}],\"_fc_id\":\"id_Fy1umuf877w5adc\",\"name\":\"ref_F7frmuf877w5aec\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"position\",\"title\":\"职位\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写职位\"}],\"_fc_id\":\"id_Fa3lmuf877w5afc\",\"name\":\"ref_Ftvrmuf877w5agc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"datePicker\",\"field\":\"leave_start_date\",\"title\":\"请假开始日期\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请选择请假开始日期\",\"mode\":\"required\"}],\"_fc_id\":\"id_F0xqmuf877w5ahc\",\"name\":\"ref_Fgynmuf877w5aic\",\"_fc_drag_tag\":\"datePicker\",\"display\":true,\"hidden\":false},{\"type\":\"datePicker\",\"field\":\"leave_end_date\",\"title\":\"请假结束日期\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请选择请假结束日期\"}],\"_fc_id\":\"id_Fmzkmuf877w5ajc\",\"name\":\"ref_Fdkkmuf877w5akc\",\"_fc_drag_tag\":\"datePicker\",\"display\":true,\"hidden\":false},{\"type\":\"select\",\"field\":\"leave_type\",\"title\":\"请假类型\",\"value\":null,\"options\":[{\"label\":\"年假\",\"value\":\"annual\"},{\"label\":\"病假\",\"value\":\"sick\"},{\"label\":\"事假\",\"value\":\"personal\"},{\"label\":\"婚假\",\"value\":\"marriage\"},{\"label\":\"产假\",\"value\":\"maternity\"},{\"label\":\"其他\",\"value\":\"other\"}],\"validate\":[{\"required\":true,\"message\":\"请选择请假类型\"}],\"_fc_id\":\"id_Fblmmuf877w5alc\",\"name\":\"ref_Ffwdmuf877w5amc\",\"_fc_drag_tag\":\"select\",\"display\":true,\"hidden\":false},{\"type\":\"inputNumber\",\"field\":\"leave_days\",\"title\":\"请假天数\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写请假天数\"}],\"_fc_id\":\"id_Fwwfmuf877w5anc\",\"name\":\"ref_Fudfmuf877w5aoc\",\"_fc_drag_tag\":\"inputNumber\",\"display\":true,\"hidden\":false},{\"type\":\"textarea\",\"field\":\"leave_reason\",\"title\":\"请假事由\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写请假事由\"}],\"_fc_id\":\"id_Fechmuf877w5apc\",\"name\":\"ref_Flbgmuf877w5aqc\",\"_fc_drag_tag\":\"textarea\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"contact_phone\",\"title\":\"紧急联系电话\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写紧急联系电话\"}],\"_fc_id\":\"id_Fisxmuf877w5arc\",\"name\":\"ref_F5ltmuf877w5asc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"radio\",\"field\":\"is_approved\",\"title\":\"是否已获得主管批准\",\"value\":null,\"options\":[{\"label\":\"是\",\"value\":\"yes\"},{\"label\":\"否\",\"value\":\"no\"}],\"validate\":[{\"required\":true,\"message\":\"请选择是否已获得主管批准\"}],\"_fc_id\":\"id_Fzjqmuf877w5atc\",\"name\":\"ref_Fv2lmuf877w5auc\",\"_fc_drag_tag\":\"radio\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"测试表单\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"},\"formName\":\"测试表单\"},\"dataSources\":[{\"id\":\"ds_mufbo50u\",\"refId\":\"ds-builtin-user-tree\",\"name\":\"系统用户\"}],\"actions\":[]}','PUBLISHED','default','BUSINESS','2026-09-24 17:22:03.000000',1),
('9e24468dbcf5e57cdeeddcc7934e629f','[{\"key\":\"item_name\",\"label\":\"物品名称\",\"columnType\":\"VARCHAR\",\"length\":255,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"},{\"key\":\"quantity\",\"label\":\"数量\",\"columnType\":\"INT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"inputNumber\"},{\"key\":\"unit_price\",\"label\":\"单价\",\"columnType\":\"INT\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"inputNumber\"},{\"key\":\"registration_date\",\"label\":\"登记日期\",\"columnType\":\"DATE\",\"length\":null,\"scale\":null,\"required\":true,\"unique\":false,\"indexed\":false,\"componentType\":\"datePicker\"},{\"key\":\"remarks\",\"label\":\"备注\",\"columnType\":\"TEXT\",\"length\":255,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"componentType\":\"input\"}]','2026-09-24 14:16:31.000000',NULL,'ai_muf52ksu88','办公用品登记业务表单',NULL,1,'{\"rule\":[{\"type\":\"input\",\"field\":\"item_name\",\"title\":\"物品名称\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写物品名称\"}],\"_fc_id\":\"id_F9pumuf6p6ricmc\",\"name\":\"ref_Famfmuf6p6ricnc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false},{\"type\":\"inputNumber\",\"field\":\"quantity\",\"title\":\"数量\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写数量\"}],\"_fc_id\":\"id_F4esmuf6p6ricoc\",\"name\":\"ref_Furfmuf6p6ricpc\",\"_fc_drag_tag\":\"inputNumber\",\"display\":true,\"hidden\":false},{\"type\":\"inputNumber\",\"field\":\"unit_price\",\"title\":\"单价\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写单价\"}],\"_fc_id\":\"id_Fqqhmuf6p6ricqc\",\"name\":\"ref_Fbinmuf6p6ricrc\",\"_fc_drag_tag\":\"inputNumber\",\"display\":true,\"hidden\":false},{\"type\":\"datePicker\",\"field\":\"registration_date\",\"title\":\"登记日期\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写登记日期\",\"mode\":\"required\"}],\"_fc_id\":\"id_Fxcfmuf6p6ricsc\",\"name\":\"ref_F91fmuf6p6rictc\",\"_fc_drag_tag\":\"datePicker\",\"display\":true,\"hidden\":false},{\"type\":\"input\",\"field\":\"remarks\",\"title\":\"备注\",\"value\":null,\"_fc_id\":\"id_Fedcmuf6p6ricuc\",\"name\":\"ref_Fd6zmuf6p6ricvc\",\"props\":{\"type\":\"textarea\"},\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\",\"formCreateFormName\":\"办公用品登记业务表单\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"},\"formName\":\"办公用品登记业务表单\"},\"dataSources\":[],\"actions\":[]}','PUBLISHED','default','BUSINESS','2026-09-24 15:31:06.000000',1),
('bcc2dd12143ec3b48dd4d4ba61f4eff0',NULL,'2026-09-24 15:33:56.000000',NULL,'ai_muf7u4ul55','会议室预约业务表单',NULL,NULL,'[]','DRAFT','default','BUSINESS','2026-09-24 15:33:56.000000',1),
('dadf29ae8b54497eaa0d64447e87bbf6',NULL,'2026-09-15 18:59:18.636532',NULL,'baoxiaodan','报销单',NULL,1,'[]','PUBLISHED','default','WORKFLOW','2026-09-15 19:02:45.648946',1),
('ddd182b016194949ab15e81a0dceea51','[{\"key\":\"person_name\",\"label\":\"姓名\",\"columnType\":\"VARCHAR\",\"length\":64},{\"key\":\"amount\",\"label\":\"金额\",\"columnType\":\"DECIMAL\",\"scale\":2}]','2026-10-10 05:43:33.386813',NULL,'e2enew_task','新节点E2E临时表单',NULL,1,'[]','PUBLISHED','default','BUSINESS','2026-10-10 05:43:33.613527',1),
('e6ab86607aca0f4dce285f108687f67a','[{\"key\": \"name\", \"label\": \"姓名\", \"columnType\": \"VARCHAR\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"input\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"department\", \"label\": \"部门\", \"columnType\": \"VARCHAR\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"input\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"leave_type\", \"label\": \"请假类型\", \"columnType\": \"VARCHAR\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"select\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"start_date\", \"label\": \"开始日期\", \"columnType\": \"DATETIME\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"datePicker\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"end_date\", \"label\": \"结束日期\", \"columnType\": \"DATETIME\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"datePicker\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}, {\"key\": \"reason\", \"label\": \"请假事由\", \"columnType\": \"TEXT\", \"length\": null, \"scale\": null, \"required\": false, \"unique\": false, \"indexed\": false, \"hidden\": false, \"pickerConfig\": null, \"storageMode\": \"JSON\", \"componentType\": \"input\", \"sortable\": null, \"filterable\": null, \"matchType\": null, \"subColumns\": null, \"subMode\": null}]','2026-09-24 14:09:29.000000',NULL,'ai_muf4tjek39','员工请假业务表单',NULL,1,'{\"rule\": [{\"type\": \"input\", \"field\": \"name\", \"title\": \"姓名\", \"value\": null, \"validate\": [{\"required\": true, \"message\": \"请填写姓名\"}]}, {\"type\": \"input\", \"field\": \"department\", \"title\": \"部门\", \"value\": null, \"validate\": [{\"required\": true, \"message\": \"请填写部门\"}]}, {\"type\": \"select\", \"field\": \"leave_type\", \"title\": \"请假类型\", \"value\": null, \"options\": [{\"label\": \"事假\", \"value\": \"事假\"}, {\"label\": \"病假\", \"value\": \"病假\"}, {\"label\": \"年假\", \"value\": \"年假\"}], \"validate\": [{\"required\": true, \"message\": \"请选择请假类型\"}]}, {\"type\": \"datePicker\", \"field\": \"start_date\", \"title\": \"开始日期\", \"value\": null}, {\"type\": \"datePicker\", \"field\": \"end_date\", \"title\": \"结束日期\", \"value\": null}, {\"type\": \"input\", \"field\": \"reason\", \"title\": \"请假事由\", \"value\": null, \"props\": {\"type\": \"textarea\"}}]}','PUBLISHED','default','BUSINESS','2026-09-24 15:26:21.000000',1),
('e6d2ffd44a6baf0d26f10a99d656c705','[{\"key\":\"meeting_room_name\",\"label\":\"会议室名称\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"booker_name\",\"label\":\"预约人\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"booking_time\",\"label\":\"预约时间\",\"columnType\":\"DATETIME\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"datePicker\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null},{\"key\":\"cancellation_reason\",\"label\":\"取消原因\",\"columnType\":\"VARCHAR\",\"length\":null,\"scale\":null,\"required\":false,\"unique\":false,\"indexed\":false,\"hidden\":false,\"pickerConfig\":null,\"storageMode\":\"JSON\",\"componentType\":\"input\",\"sortable\":null,\"filterable\":null,\"matchType\":null,\"subColumns\":null,\"subMode\":null}]','2026-09-24 15:33:58.000000',NULL,'ai_muf7u70h84','会议室预约表单',NULL,NULL,'{\"rule\":[{\"type\":\"input\",\"field\":\"meeting_room_name\",\"title\":\"会议室名称\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写会议室名称\"}]},{\"type\":\"input\",\"field\":\"booker_name\",\"title\":\"预约人\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请填写预约人\"}]},{\"type\":\"datePicker\",\"field\":\"booking_time\",\"title\":\"预约时间\",\"value\":null,\"validate\":[{\"required\":true,\"message\":\"请选择预约时间\"}]},{\"type\":\"input\",\"field\":\"cancellation_reason\",\"title\":\"取消原因\",\"value\":null}]}','DRAFT','default','BUSINESS','2026-09-24 15:33:58.000000',1);
/*!40000 ALTER TABLE `wf_form_def` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_form_logic_binding`
--

DROP TABLE IF EXISTS `wf_form_logic_binding`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_form_logic_binding` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `enabled` bit(1) NOT NULL,
  `execution_mode` varchar(20) NOT NULL,
  `flow_key` varchar(64) NOT NULL,
  `form_key` varchar(64) NOT NULL,
  `form_type` varchar(20) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `trigger_type` varchar(32) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_form_logic_binding` (`tenant_id`,`form_type`,`form_key`,`trigger_type`,`flow_key`),
  KEY `idx_flb_form` (`tenant_id`,`form_type`,`form_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_form_logic_binding`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_form_logic_binding` WRITE;
/*!40000 ALTER TABLE `wf_form_logic_binding` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_form_logic_binding` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_logic_flow`
--

DROP TABLE IF EXISTS `wf_logic_flow`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_logic_flow` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `description` varchar(500) DEFAULT NULL,
  `dsl_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`dsl_json`)),
  `flow_key` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `status` varchar(20) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `version` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_logic_flow_key` (`tenant_id`,`flow_key`),
  KEY `idx_logic_flow_key` (`flow_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_logic_flow`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_logic_flow` WRITE;
/*!40000 ALTER TABLE `wf_logic_flow` DISABLE KEYS */;
INSERT INTO `wf_logic_flow` VALUES
('11771babafea414f88c1203e7017dee6','2026-10-10 05:44:38.579113','','{\"nodes\":[{\"id\":\"b1\",\"type\":\"BATCH\",\"name\":\"b\",\"x\":80,\"y\":176,\"config\":{\"collection\":\"{{nums}}\",\"chunkSize\":2,\"maxItems\":100,\"stopOnError\":true,\"body\":[{\"id\":\"p\",\"type\":\"SQL_SCRIPT\",\"name\":\"p\",\"x\":273,\"y\":216,\"config\":{\"sql\":\"SELECT 1\",\"onError\":\"abort\"},\"errorAction\":\"FAIL_FLOW\"}]},\"errorAction\":\"FAIL_FLOW\"},{\"id\":\"e\",\"type\":\"END\",\"name\":\"e\",\"x\":50,\"y\":410},{\"id\":\"data_insert_ehfh\",\"type\":\"DATA_INSERT\",\"name\":\"数据新增\",\"x\":60,\"y\":290,\"config\":{\"formKey\":\"\",\"data\":[{\"column\":\"\",\"value\":\"\"}]},\"errorAction\":\"FAIL_FLOW\"},{\"id\":\"start_lz4x\",\"type\":\"START\",\"name\":\"开始\",\"x\":80,\"y\":60}],\"edges\":[{\"source\":\"b1\",\"target\":\"data_insert_ehfh\",\"id\":\"vueflow__edge-b1-data_insert_ehfhin\"},{\"source\":\"data_insert_ehfh\",\"target\":\"e\",\"id\":\"vueflow__edge-data_insert_ehfhout-e\"},{\"source\":\"start_lz4x\",\"target\":\"b1\",\"id\":\"vueflow__edge-start_lz4xout-b1in\"}],\"inputVars\":[{\"name\":\"nums\",\"type\":\"json\",\"required\":true}]}','dbg_batch2','dbg','PUBLISHED','default','2026-10-10 05:53:37.572231',1),
('6049d1ee5c07414cace33f6aff274f4a','2026-10-10 05:44:14.945961',NULL,'{\"nodes\":[{\"id\":\"s\",\"type\":\"START\",\"name\":\"x\",\"x\":1,\"y\":1},{\"id\":\"b1\",\"type\":\"BATCH\",\"name\":\"b\",\"x\":2,\"y\":2,\"config\":{\"collection\":\"{{nums}}\",\"chunkSize\":2,\"maxItems\":100,\"stopOnError\":true,\"body\":[{\"id\":\"p\",\"type\":\"SQL_SCRIPT\",\"name\":\"p\",\"config\":{\"sql\":\"SELECT 1\",\"onError\":\"abort\"}}]}},{\"id\":\"e\",\"type\":\"END\",\"name\":\"e\",\"x\":3,\"y\":3}],\"edges\":[{\"id\":\"e1\",\"source\":\"s\",\"target\":\"b1\"},{\"id\":\"e2\",\"source\":\"b1\",\"target\":\"e\"}],\"inputVars\":[{\"name\":\"nums\",\"type\":\"json\",\"required\":true}]}','dbg_batch','dbg','PUBLISHED','default','2026-10-10 05:44:15.007599',1),
('88bcfe0b7a1742a7b09a3286012a78b9','2026-10-08 01:04:24.119650',NULL,'{\"nodes\":[{\"id\":\"start\",\"type\":\"START\",\"name\":\"开始\",\"x\":360.0,\"y\":80.0,\"config\":null,\"resultVar\":null,\"errorAction\":null},{\"id\":\"end\",\"type\":\"END\",\"name\":\"结束\",\"x\":360.0,\"y\":320.0,\"config\":null,\"resultVar\":null,\"errorAction\":null}],\"edges\":[{\"id\":\"e1\",\"source\":\"start\",\"target\":\"end\",\"branch\":null}],\"inputVars\":null}','var_picker_test','变量选择器测试流','DRAFT','default','2026-10-08 01:04:24.119670',0);
/*!40000 ALTER TABLE `wf_logic_flow` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_logic_flow_run`
--

DROP TABLE IF EXISTS `wf_logic_flow_run`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_logic_flow_run` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `duration_ms` bigint(20) NOT NULL,
  `error_message` text DEFAULT NULL,
  `flow_id` varchar(64) NOT NULL,
  `flow_key` varchar(64) NOT NULL,
  `flow_name` varchar(128) DEFAULT NULL,
  `input_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`input_json`)),
  `output_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`output_json`)),
  `started_at` datetime(6) DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `traces_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`traces_json`)),
  PRIMARY KEY (`id`),
  KEY `idx_lfr_flow_id` (`flow_id`),
  KEY `idx_lfr_flow_key` (`flow_key`),
  KEY `idx_lfr_flow_name` (`flow_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_logic_flow_run`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_logic_flow_run` WRITE;
/*!40000 ALTER TABLE `wf_logic_flow_run` DISABLE KEYS */;
INSERT INTO `wf_logic_flow_run` VALUES
('14d761c9cb6b489b9b23eef4752f74f8','2026-10-10 05:44:51.988202',3,NULL,'11771babafea414f88c1203e7017dee6','dbg_batch2','dbg','{\"nums\":[1,2,3,4,5]}','{\"nums\":[1,2,3,4,5],\"item\":[5],\"index\":2,\"p\":{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},\"b1\":{\"total\":3,\"succeeded\":3,\"failed\":0,\"truncated\":false,\"results\":[{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"0\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}}],\"errors\":[],\"chunkSize\":2,\"brokenAt\":null}}','2026-10-10 05:44:51.982704','SUCCESS','[{\"nodeId\":\"s\",\"nodeName\":\"x\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"p\",\"nodeName\":\"p\",\"type\":\"SQL_SCRIPT\",\"status\":\"SUCCESS\",\"result\":{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},\"error\":null,\"durationMs\":\"1\"},{\"nodeId\":\"b1\",\"nodeName\":\"b\",\"type\":\"BATCH\",\"status\":\"SUCCESS\",\"result\":{\"total\":3,\"succeeded\":3,\"failed\":0,\"truncated\":false,\"results\":[{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"0\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}}],\"errors\":[],\"chunkSize\":2,\"brokenAt\":null},\"error\":null,\"durationMs\":\"3\"},{\"nodeId\":\"e\",\"nodeName\":\"e\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]'),
('7c90dcd73cf248d7a1f670b0f5822ed9','2026-10-10 05:44:15.066890',3,NULL,'6049d1ee5c07414cace33f6aff274f4a','dbg_batch','dbg','{\"nums\":[1,2,3,4,5]}','{\"nums\":[1,2,3,4,5],\"item\":[5],\"index\":2,\"p\":{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"0\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},\"b1\":{\"total\":3,\"succeeded\":3,\"failed\":0,\"truncated\":false,\"results\":[{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"0\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"0\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}}],\"errors\":[],\"chunkSize\":2,\"brokenAt\":null}}','2026-10-10 05:44:15.058423','SUCCESS','[{\"nodeId\":\"s\",\"nodeName\":\"x\",\"type\":\"START\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"},{\"nodeId\":\"p\",\"nodeName\":\"p\",\"type\":\"SQL_SCRIPT\",\"status\":\"SUCCESS\",\"result\":{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},\"error\":null,\"durationMs\":\"1\"},{\"nodeId\":\"b1\",\"nodeName\":\"b\",\"type\":\"BATCH\",\"status\":\"SUCCESS\",\"result\":{\"total\":3,\"succeeded\":3,\"failed\":0,\"truncated\":false,\"results\":[{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"1\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"0\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}},{\"total\":1,\"succeeded\":1,\"failed\":0,\"durationMs\":\"0\",\"s0\":{\"index\":0,\"kind\":\"QUERY\",\"data\":[{\"1\":1}],\"rows\":1,\"ok\":true}}],\"errors\":[],\"chunkSize\":2,\"brokenAt\":null},\"error\":null,\"durationMs\":\"3\"},{\"nodeId\":\"e\",\"nodeName\":\"e\",\"type\":\"END\",\"status\":\"SUCCESS\",\"result\":null,\"error\":null,\"durationMs\":\"0\"}]');
/*!40000 ALTER TABLE `wf_logic_flow_run` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_node_config`
--

DROP TABLE IF EXISTS `wf_node_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_node_config` (
  `id` varchar(64) NOT NULL,
  `config_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`config_json`)),
  `created_at` datetime(6) DEFAULT NULL,
  `node_id` varchar(255) NOT NULL,
  `node_type` varchar(64) NOT NULL,
  `process_def_id` varchar(64) NOT NULL,
  `process_definition_id` varchar(64) DEFAULT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_node` (`tenant_id`,`process_def_id`,`node_id`),
  UNIQUE KEY `uk_node_version` (`tenant_id`,`process_def_id`,`node_id`,`process_definition_id`),
  KEY `idx_def` (`tenant_id`,`process_def_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_node_config`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_node_config` WRITE;
/*!40000 ALTER TABLE `wf_node_config` DISABLE KEYS */;
INSERT INTO `wf_node_config` VALUES
('1f06871639a34d298fb406e0accb2c58','{\"basic\": {\"name\": \"多人审批\"}, \"timeout\": {\"action\": \"remind\", \"duration\": 0}, \"approval\": {\"multiMode\": \"\"}, \"operations\": {\"allowReject\": true, \"allowAddSign\": false, \"allowDelegate\": false, \"allowTransfer\": true}}','2026-09-11 10:48:10.689698','Activity_0lwswse','userTask','be9204eac01647d69c2ed9423173b698',NULL,'default','2026-09-11 10:48:10.689698'),
('3c1aebc482f54fb483fbb1016f5c3fcd','{\"basic\": {\"name\": \"去重审批\"}, \"timeout\": {\"action\": \"remind\", \"duration\": 0}, \"approval\": {\"multiMode\": \"\"}, \"operations\": {\"allowReject\": true, \"allowAddSign\": false, \"allowDelegate\": false, \"allowTransfer\": true}}','2026-09-11 10:48:10.689698','Activity_1tsdpa6','userTask','be9204eac01647d69c2ed9423173b698',NULL,'default','2026-09-11 10:48:10.689698'),
('620c09cff56403f62728b00748a26e93','{\"approvalPolicy\":{\"deduplication\":{\"enabled\":false,\"scope\":\"GLOBAL\",\"mode\":\"CONSECUTIVE\",\"action\":\"AUTO_PASS\",\"skipSameAsInitiator\":false},\"operations\":{\"allowReject\":true,\"allowAddSign\":true,\"allowTransfer\":true,\"allowDelegate\":true},\"commentPolicy\":{\"enabled\":false,\"scope\":\"REJECT_RETURN\"},\"signaturePolicy\":{\"enabled\":false,\"useLast\":false,\"allowUpload\":false,\"required\":false},\"comment\":{\"disabled\":false,\"disallowDelete\":false,\"disallowAttachment\":false},\"approveRecall\":false,\"retakeSkipApproved\":false},\"titleRule\":{\"enabled\":false,\"pattern\":\"\"},\"summaryRule\":{\"enabled\":false,\"fields\":[],\"showInSms\":false},\"dynamicProcess\":false,\"timeoutRules\":[],\"starterScope\":{\"mode\":\"ALL\",\"userIds\":[],\"roleIds\":[]},\"adminUserIds\":[],\"numberRule\":{\"enabled\":false,\"pattern\":\"{{year}}-{{seq:4}}\"}}','2026-09-30 01:42:56.000000','__PROCESS__','unknown','f50d6d7a012aea6df8710a35de24b267',NULL,'default','2026-09-30 01:42:56.000000'),
('e8205c45a7364b6cb6fd6faedd930072','{\"numberRule\": {\"enabled\": false, \"pattern\": \"{{year}}-{{seq:4}}\"}, \"approvalPolicy\": {\"operations\": {\"allowReject\": true, \"allowAddSign\": true, \"allowDelegate\": true, \"allowTransfer\": true}, \"allowRecall\": true, \"deduplication\": {\"scope\": \"GLOBAL\", \"action\": \"AUTO_PASS\", \"enabled\": false}}}','2026-09-11 10:48:10.689184','__PROCESS__','process','be9204eac01647d69c2ed9423173b698',NULL,'default','2026-09-11 10:48:10.689184');
/*!40000 ALTER TABLE `wf_node_config` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_page_def`
--

DROP TABLE IF EXISTS `wf_page_def`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_page_def` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `data_source_id` varchar(64) DEFAULT NULL,
  `form_key` varchar(255) DEFAULT NULL,
  `key` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `published_version` int(11) DEFAULT NULL,
  `schema` longtext DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `type` varchar(32) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `version` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_page_def_tenant_key_version` (`tenant_id`,`key`,`version`),
  KEY `idx_page_def_tenant_form` (`tenant_id`,`form_key`),
  KEY `idx_page_def_tenant_status` (`tenant_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_page_def`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_page_def` WRITE;
/*!40000 ALTER TABLE `wf_page_def` DISABLE KEYS */;
INSERT INTO `wf_page_def` VALUES
('bbc2d83f6100453c92c6d239cc192e7d','2026-09-15 18:38:48.363138',NULL,NULL,NULL,'test_page','测试页面',1,'{\"rule\":[{\"type\":\"page-table\",\"field\":\"table1789468745852\",\"title\":\"\",\"props\":{\"dataSourceId\":\"ds_mu2jhb3n\",\"border\":true,\"stripe\":true,\"columns\":[{\"prop\":\"code\",\"label\":\"人员编码\"},{\"prop\":\"name\",\"label\":\"人员姓名\"},{\"prop\":\"dept\",\"label\":\"所属部门\"}],\"sortable\":false,\"filterable\":false,\"pagination\":true,\"selectionMode\":\"none\",\"actionColumnWidth\":0,\"showSearch\":true,\"stretch\":true,\"searchFields\":[{\"key\":\"code\",\"label\":\"人员编码\",\"matchType\":\"eq\"},{\"key\":\"name\",\"label\":\"人员姓名\",\"matchType\":\"eq\"},{\"key\":\"dept\",\"label\":\"所属部门\",\"matchType\":\"eq\"}],\"sortableFields\":[\"code\",\"name\"],\"pageSize\":20,\"pageSizes\":[10,20,50],\"viewActions\":{\"buttons\":[{\"key\":\"edit\",\"label\":\"编辑\",\"placement\":\"column\",\"style\":\"icon\"},{\"key\":\"delete\",\"label\":\"删除\",\"placement\":\"column\",\"style\":\"icon\"},{\"key\":\"create\",\"label\":\"新增\",\"placement\":\"toolbar\",\"style\":\"button\"},{\"key\":\"view\",\"label\":\"查看\",\"placement\":\"column\",\"style\":\"button\"}],\"permissions\":\"\"},\"viewDetail\":{\"width\":\"800px\",\"type\":\"form\",\"formMode\":\"drawer\"},\"viewEvents\":[],\"designMode\":true},\"_fc_id\":\"id_Fei8mu2jhl6kapc\",\"name\":\"ref_Fp3xmu2jhl6kaqc\",\"_fc_drag_tag\":\"page-table\",\"display\":true,\"hidden\":false},{\"type\":\"formContainer\",\"field\":\"F7n9mu2jn6reabc\",\"title\":\"数据容器\",\"info\":\"\",\"$required\":false,\"props\":{\"recordLocator\":{\"type\":\"current-record\"},\"displayMode\":\"dialog\",\"dialogWidth\":\"800px\",\"dialogHeight\":\"600px\",\"tabTitle\":\"编辑记录\",\"inlineHeight\":\"auto\",\"showNewButton\":true,\"showCancelButton\":true,\"showConfirmButton\":true,\"showDeleteButton\":false,\"showCopyButton\":false,\"customButtons\":[],\"dataSourceId\":\"ds_mu2jhb3n\",\"rule\":[{\"type\":\"input\",\"field\":\"name\",\"title\":\"姓名\",\"info\":\"\",\"$required\":false,\"_fc_id\":\"id_Fi7lmu2jnbojafc\",\"name\":\"ref_F411mu2jnbojagc\",\"_fc_drag_tag\":\"input\",\"display\":true,\"hidden\":false}]},\"_fc_id\":\"id_Ffydmu2jn6reacc\",\"name\":\"ref_Fre6mu2jn6readc\",\"_fc_drag_tag\":\"formContainer\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"}},\"dataSources\":[{\"id\":\"ds_mu2jhb3n\",\"refId\":\"20f476f047ca4386bfd1365ea5516832\",\"name\":\"请假人员 数据源\"}],\"actions\":[{\"trigger\":\"row-edit\",\"source\":\"ds_mu2jhb3n\",\"steps\":[{\"op\":\"open-container\",\"target\":\"ds_mu2jhb3n\",\"displayMode\":\"dialog\"}]}]}','PUBLISHED','default','PAGE','2026-09-15 19:15:14.720229',1),
('ccade5ed0f68e55315b0e0834867c436','2026-09-25 00:34:44.000000',NULL,NULL,NULL,'test1','测试页面',1,'{\"rule\":[{\"type\":\"page-table\",\"field\":\"table1790295600611\",\"title\":\"\",\"props\":{\"dataSourceId\":\"ds_mug7s41d\",\"border\":true,\"stripe\":true,\"columns\":[{\"prop\":\"apply_name\",\"label\":\"申请人姓名\"},{\"prop\":\"leave_end_date\",\"label\":\"请假结束日期\"},{\"prop\":\"leave_start_date\",\"label\":\"请假开始日期\"},{\"prop\":\"leave_days\",\"label\":\"请假天数\"},{\"prop\":\"leave_type\",\"label\":\"请假类型\"},{\"prop\":\"person_name\",\"label\":\"请假人姓名\"},{\"prop\":\"department\",\"label\":\"所属部门\"},{\"prop\":\"leave_reason\",\"label\":\"请假事由\"},{\"prop\":\"is_approved\",\"label\":\"是否已获得主管批准\"},{\"prop\":\"contact_phone\",\"label\":\"紧急联系电话\"},{\"prop\":\"position\",\"label\":\"职位\"}],\"sortable\":false,\"filterable\":false,\"pagination\":true,\"selectionMode\":\"none\",\"actionColumnWidth\":0,\"showSearch\":true,\"stretch\":true,\"searchFields\":[],\"sortableFields\":[\"person_name\",\"department\",\"position\",\"leave_start_date\",\"leave_end_date\",\"leave_days\",\"contact_phone\",\"is_approved\",\"apply_name\"],\"pageSize\":20,\"pageSizes\":[10,20,50],\"viewActions\":{\"buttons\":[{\"key\":\"edit\",\"label\":\"编辑\",\"placement\":\"column\",\"style\":\"icon\"},{\"key\":\"delete\",\"label\":\"删除\",\"placement\":\"column\",\"style\":\"icon\"}],\"permissions\":\"\"},\"viewDetail\":{\"width\":\"800px\",\"type\":\"form\"},\"viewEvents\":[],\"designMode\":true},\"_fc_id\":\"id_Fqfrmug7ryebabc\",\"name\":\"ref_Fos4mug7ryebacc\",\"_fc_drag_tag\":\"page-table\",\"display\":true,\"hidden\":false}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"right\",\"size\":\"default\",\"labelWidth\":\"125px\"},\"resetBtn\":{\"show\":false,\"innerText\":\"重置\"},\"submitBtn\":{\"show\":true,\"innerText\":\"提交\"}},\"dataSources\":[{\"id\":\"ds_mug7s41d\",\"refId\":\"e6741228ebda42fb8fa0c5717800d27a\",\"name\":\"测试表单 数据源\"}],\"actions\":[]}','PUBLISHED','default','PAGE','2026-09-27 13:55:41.000000',1),
('f5d2e46500e74402831590ae8d310cd0','2026-10-03 01:29:54.144312',NULL,NULL,NULL,'dashboard','主页仪表盘',1,'{\"rule\":[{\"type\":\"dash-kpi\",\"field\":\"kpiDefCount\",\"title\":\"流程定义数\",\"col\":{\"span\":12},\"props\":{\"title\":\"流程定义数\",\"subtitle\":\"已部署流程定义\",\"unit\":\"个\",\"agg\":\"count\",\"metric\":null,\"dataSourceId\":\"ds_def\",\"numberFormat\":\"\",\"trendEnabled\":false,\"trendGrain\":\"day\",\"trendField\":\"\",\"sparkline\":false,\"sparkRange\":12,\"span\":12,\"height\":\"140px\"}},{\"type\":\"dash-kpi\",\"field\":\"kpiRunning\",\"title\":\"运行中流程\",\"col\":{\"span\":12},\"props\":{\"title\":\"运行中流程\",\"subtitle\":\"进行中的流程实例\",\"unit\":\"条\",\"agg\":\"count\",\"metric\":null,\"dataSourceId\":\"ds_inst\",\"filter\":\"{\\\"conditions\\\": [{\\\"column\\\": \\\"status\\\", \\\"op\\\": \\\"eq\\\", \\\"value\\\": \\\"running\\\"}], \\\"logic\\\": \\\"AND\\\"}\",\"numberFormat\":\"\",\"trendEnabled\":false,\"trendGrain\":\"day\",\"trendField\":\"\",\"sparkline\":false,\"sparkRange\":12,\"span\":12,\"height\":\"140px\"}},{\"type\":\"dash-chart\",\"field\":\"chartTrend\",\"title\":\"发起趋势\",\"col\":{\"span\":12},\"props\":{\"title\":\"发起趋势\",\"chartType\":\"line\",\"group\":\"startTime\",\"timeGrain\":\"day\",\"agg\":\"count\",\"metric\":null,\"sort\":\"key\",\"order\":\"asc\",\"limit\":14,\"dataSourceId\":\"ds_inst\",\"height\":\"280px\",\"span\":12}},{\"type\":\"dash-chart\",\"field\":\"chartDist\",\"title\":\"流程分布\",\"col\":{\"span\":12},\"props\":{\"title\":\"流程分布\",\"chartType\":\"pie\",\"group\":\"processDefinitionName\",\"timeGrain\":null,\"agg\":\"count\",\"metric\":null,\"sort\":\"value\",\"order\":\"desc\",\"limit\":8,\"dataSourceId\":\"ds_inst\",\"height\":\"280px\",\"span\":12}}],\"option\":{\"form\":{\"inline\":false,\"hideRequiredAsterisk\":false,\"labelPosition\":\"top\",\"size\":\"default\",\"labelWidth\":\"auto\"}},\"dataSources\":[{\"id\":\"ds_def\",\"refId\":\"ds-builtin-process-definitions\",\"name\":\"流程定义\"},{\"id\":\"ds_inst\",\"refId\":\"ds-builtin-process-instances\",\"name\":\"流程实例\"}],\"actions\":[]}','PUBLISHED','default','PAGE','2026-10-03 01:29:54.331685',1);
/*!40000 ALTER TABLE `wf_page_def` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_process_draft`
--

DROP TABLE IF EXISTS `wf_process_draft`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_process_draft` (
  `id` varchar(64) NOT NULL,
  `bpmn_xml` longtext NOT NULL,
  `category_id` varchar(64) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `created_by` varchar(50) DEFAULT NULL,
  `deploy_id` varchar(64) DEFAULT NULL,
  `deployed_config_hash` varchar(64) DEFAULT NULL,
  `deployed_xml` longtext DEFAULT NULL,
  `process_key` varchar(255) NOT NULL,
  `last_deployed_at` datetime(6) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `process_definition_id` varchar(64) DEFAULT NULL,
  `status` varchar(32) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `version` int(11) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tenant` (`tenant_id`),
  KEY `idx_wf_draft_key` (`tenant_id`,`process_key`),
  KEY `idx_category` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_process_draft`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_process_draft` WRITE;
/*!40000 ALTER TABLE `wf_process_draft` DISABLE KEYS */;
INSERT INTO `wf_process_draft` VALUES
('4f10a0d7bf698bca3eeae99dd132d5a1','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"64f4802b34e352e3da0d7aeb9fa71de2\">\n  <bpmn:process id=\"leave\" name=\"请假\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\"/>\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"leave\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Rect x=\"160\" y=\"160\" width=\"36\" height=\"36\"/>\n      </bpmndi:BPMNShape>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>','64f4802b34e352e3da0d7aeb9fa71de2','2026-09-27 21:54:59.000000',NULL,NULL,NULL,NULL,'leave',NULL,'请假',NULL,'DRAFT','default','2026-09-27 21:54:59.000000',0,NULL),
('be9204eac01647d69c2ed9423173b698','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"abbde8e4a6f74009a8a595bb7c38973c\">\n  <bpmn:process id=\"leave_apply\" name=\"请假流程\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"Event_1c3exx9\">\n      <bpmn:outgoing>Flow_18tdmgw</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_1dd4ed3\" name=\"发起节点\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_18tdmgw</bpmn:incoming>\n      <bpmn:outgoing>Flow_1h1y4wd</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_18tdmgw\" sourceRef=\"Event_1c3exx9\" targetRef=\"Activity_1dd4ed3\" />\n    <bpmn:userTask id=\"Activity_0lwswse\" name=\"多人审批\">\n      <bpmn:incoming>Flow_1h1y4wd</bpmn:incoming>\n      <bpmn:outgoing>Flow_0cbe119</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1h1y4wd\" sourceRef=\"Activity_1dd4ed3\" targetRef=\"Activity_0lwswse\" />\n    <bpmn:userTask id=\"Activity_1tsdpa6\" name=\"去重审批\">\n      <bpmn:incoming>Flow_0cbe119</bpmn:incoming>\n      <bpmn:outgoing>Flow_1cusaqg</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_0cbe119\" sourceRef=\"Activity_0lwswse\" targetRef=\"Activity_1tsdpa6\" />\n    <bpmn:userTask id=\"Activity_0rrplp3\" name=\"多表单\">\n      <bpmn:incoming>Flow_1cusaqg</bpmn:incoming>\n      <bpmn:outgoing>Flow_0xzyx7i</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1cusaqg\" sourceRef=\"Activity_1tsdpa6\" targetRef=\"Activity_0rrplp3\" />\n    <bpmn:endEvent id=\"Event_0ua71tz\">\n      <bpmn:incoming>Flow_0xzyx7i</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_0xzyx7i\" sourceRef=\"Activity_0rrplp3\" targetRef=\"Event_0ua71tz\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"leave_apply\">\n      <bpmndi:BPMNShape id=\"Event_1c3exx9_di\" bpmnElement=\"Event_1c3exx9\">\n        <dc:Bounds x=\"127\" y=\"285\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_1dd4ed3_di\" bpmnElement=\"Activity_1dd4ed3\">\n        <dc:Bounds x=\"220\" y=\"263\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0lwswse_di\" bpmnElement=\"Activity_0lwswse\">\n        <dc:Bounds x=\"380\" y=\"263\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_1tsdpa6_di\" bpmnElement=\"Activity_1tsdpa6\">\n        <dc:Bounds x=\"540\" y=\"263\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0rrplp3_di\" bpmnElement=\"Activity_0rrplp3\">\n        <dc:Bounds x=\"690\" y=\"263\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_0ua71tz_di\" bpmnElement=\"Event_0ua71tz\">\n        <dc:Bounds x=\"842\" y=\"285\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_18tdmgw_di\" bpmnElement=\"Flow_18tdmgw\">\n        <di:waypoint x=\"163\" y=\"303\" />\n        <di:waypoint x=\"220\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1h1y4wd_di\" bpmnElement=\"Flow_1h1y4wd\">\n        <di:waypoint x=\"320\" y=\"303\" />\n        <di:waypoint x=\"380\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_0cbe119_di\" bpmnElement=\"Flow_0cbe119\">\n        <di:waypoint x=\"480\" y=\"303\" />\n        <di:waypoint x=\"540\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1cusaqg_di\" bpmnElement=\"Flow_1cusaqg\">\n        <di:waypoint x=\"640\" y=\"303\" />\n        <di:waypoint x=\"690\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_0xzyx7i_di\" bpmnElement=\"Flow_0xzyx7i\">\n        <di:waypoint x=\"790\" y=\"303\" />\n        <di:waypoint x=\"842\" y=\"303\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n','abbde8e4a6f74009a8a595bb7c38973c','2026-09-11 10:39:53.500261',NULL,NULL,NULL,NULL,'leave_apply',NULL,'请假流程',NULL,'DRAFT','default','2026-09-11 10:48:10.689698',0,NULL),
('f50d6d7a012aea6df8710a35de24b267','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"http://flowable.org/bpmn\">\n  <bpmn:process id=\"ui_verify_flow\" name=\"UI验证流程\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\">\n      <bpmn:outgoing>Flow_10bijim</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_0q13unc\" name=\"发起节点\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_10bijim</bpmn:incoming>\n      <bpmn:outgoing>Flow_1mkegyr</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_10bijim\" sourceRef=\"startEvent_1\" targetRef=\"Activity_0q13unc\" />\n    <bpmn:userTask id=\"Activity_0np59ha\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1mkegyr</bpmn:incoming>\n      <bpmn:outgoing>Flow_1avyfx2</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1mkegyr\" sourceRef=\"Activity_0q13unc\" targetRef=\"Activity_0np59ha\" />\n    <bpmn:userTask id=\"Activity_023htgs\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1avyfx2</bpmn:incoming>\n      <bpmn:outgoing>Flow_04920vf</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1avyfx2\" sourceRef=\"Activity_0np59ha\" targetRef=\"Activity_023htgs\" />\n    <bpmn:userTask id=\"Activity_0wemnzz\" wf:nodeRole=\"approver\">\n      <bpmn:incoming>Flow_04920vf</bpmn:incoming>\n      <bpmn:outgoing>Flow_1bblzfz</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_04920vf\" sourceRef=\"Activity_023htgs\" targetRef=\"Activity_0wemnzz\" />\n    <bpmn:endEvent id=\"Event_04ffjpj\">\n      <bpmn:incoming>Flow_1bblzfz</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_1bblzfz\" sourceRef=\"Activity_0wemnzz\" targetRef=\"Event_04ffjpj\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"ui_verify_flow\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Bounds x=\"160\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0q13unc_di\" bpmnElement=\"Activity_0q13unc\">\n        <dc:Bounds x=\"250\" y=\"138\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0np59ha_di\" bpmnElement=\"Activity_0np59ha\">\n        <dc:Bounds x=\"410\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_023htgs_di\" bpmnElement=\"Activity_023htgs\">\n        <dc:Bounds x=\"570\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0wemnzz_di\" bpmnElement=\"Activity_0wemnzz\">\n        <dc:Bounds x=\"730\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_04ffjpj_di\" bpmnElement=\"Event_04ffjpj\">\n        <dc:Bounds x=\"892\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_10bijim_di\" bpmnElement=\"Flow_10bijim\">\n        <di:waypoint x=\"196\" y=\"178\" />\n        <di:waypoint x=\"250\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1mkegyr_di\" bpmnElement=\"Flow_1mkegyr\">\n        <di:waypoint x=\"350\" y=\"178\" />\n        <di:waypoint x=\"410\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1avyfx2_di\" bpmnElement=\"Flow_1avyfx2\">\n        <di:waypoint x=\"510\" y=\"178\" />\n        <di:waypoint x=\"570\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_04920vf_di\" bpmnElement=\"Flow_04920vf\">\n        <di:waypoint x=\"670\" y=\"178\" />\n        <di:waypoint x=\"730\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1bblzfz_di\" bpmnElement=\"Flow_1bblzfz\">\n        <di:waypoint x=\"830\" y=\"178\" />\n        <di:waypoint x=\"892\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n',NULL,'2026-09-30 01:18:47.000000',NULL,'ebeedebc-a08a-a49e-b50b-d75ef7811064','041b3974db57dece93836aedb001faf160851101f5364cecf304c70fedb108fd','<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<bpmn:definitions xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" xmlns:bpmndi=\"http://www.omg.org/spec/BPMN/20100524/DI\" xmlns:dc=\"http://www.omg.org/spec/DD/20100524/DC\" xmlns:di=\"http://www.omg.org/spec/DD/20100524/DI\" xmlns:wf=\"http://workflow.com/schema/bpmn/wf\" xmlns:flowable=\"http://flowable.org/bpmn\" targetNamespace=\"http://flowable.org/bpmn\">\n  <bpmn:process id=\"ui_verify_flow\" name=\"UI验证流程\" isExecutable=\"true\">\n    <bpmn:startEvent id=\"startEvent_1\">\n      <bpmn:outgoing>Flow_10bijim</bpmn:outgoing>\n    </bpmn:startEvent>\n    <bpmn:userTask id=\"Activity_0q13unc\" name=\"发起节点\" wf:nodeRole=\"initiator\" flowable:assignee=\"${initiator}\">\n      <bpmn:incoming>Flow_10bijim</bpmn:incoming>\n      <bpmn:outgoing>Flow_1mkegyr</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_10bijim\" sourceRef=\"startEvent_1\" targetRef=\"Activity_0q13unc\" />\n    <bpmn:userTask id=\"Activity_0np59ha\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1mkegyr</bpmn:incoming>\n      <bpmn:outgoing>Flow_1avyfx2</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1mkegyr\" sourceRef=\"Activity_0q13unc\" targetRef=\"Activity_0np59ha\" />\n    <bpmn:userTask id=\"Activity_023htgs\" wf:nodeRole=\"handler\">\n      <bpmn:incoming>Flow_1avyfx2</bpmn:incoming>\n      <bpmn:outgoing>Flow_04920vf</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_1avyfx2\" sourceRef=\"Activity_0np59ha\" targetRef=\"Activity_023htgs\" />\n    <bpmn:userTask id=\"Activity_0wemnzz\" wf:nodeRole=\"approver\">\n      <bpmn:incoming>Flow_04920vf</bpmn:incoming>\n      <bpmn:outgoing>Flow_1bblzfz</bpmn:outgoing>\n    </bpmn:userTask>\n    <bpmn:sequenceFlow id=\"Flow_04920vf\" sourceRef=\"Activity_023htgs\" targetRef=\"Activity_0wemnzz\" />\n    <bpmn:endEvent id=\"Event_04ffjpj\">\n      <bpmn:incoming>Flow_1bblzfz</bpmn:incoming>\n    </bpmn:endEvent>\n    <bpmn:sequenceFlow id=\"Flow_1bblzfz\" sourceRef=\"Activity_0wemnzz\" targetRef=\"Event_04ffjpj\" />\n  </bpmn:process>\n  <bpmndi:BPMNDiagram id=\"BPMNDiagram_1\">\n    <bpmndi:BPMNPlane id=\"BPMNPlane_1\" bpmnElement=\"ui_verify_flow\">\n      <bpmndi:BPMNShape id=\"startEvent_1_di\" bpmnElement=\"startEvent_1\">\n        <dc:Bounds x=\"160\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0q13unc_di\" bpmnElement=\"Activity_0q13unc\">\n        <dc:Bounds x=\"250\" y=\"138\" width=\"100\" height=\"80\" />\n        <bpmndi:BPMNLabel />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0np59ha_di\" bpmnElement=\"Activity_0np59ha\">\n        <dc:Bounds x=\"410\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_023htgs_di\" bpmnElement=\"Activity_023htgs\">\n        <dc:Bounds x=\"570\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Activity_0wemnzz_di\" bpmnElement=\"Activity_0wemnzz\">\n        <dc:Bounds x=\"730\" y=\"138\" width=\"100\" height=\"80\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNShape id=\"Event_04ffjpj_di\" bpmnElement=\"Event_04ffjpj\">\n        <dc:Bounds x=\"892\" y=\"160\" width=\"36\" height=\"36\" />\n      </bpmndi:BPMNShape>\n      <bpmndi:BPMNEdge id=\"Flow_10bijim_di\" bpmnElement=\"Flow_10bijim\">\n        <di:waypoint x=\"196\" y=\"178\" />\n        <di:waypoint x=\"250\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1mkegyr_di\" bpmnElement=\"Flow_1mkegyr\">\n        <di:waypoint x=\"350\" y=\"178\" />\n        <di:waypoint x=\"410\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1avyfx2_di\" bpmnElement=\"Flow_1avyfx2\">\n        <di:waypoint x=\"510\" y=\"178\" />\n        <di:waypoint x=\"570\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_04920vf_di\" bpmnElement=\"Flow_04920vf\">\n        <di:waypoint x=\"670\" y=\"178\" />\n        <di:waypoint x=\"730\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n      <bpmndi:BPMNEdge id=\"Flow_1bblzfz_di\" bpmnElement=\"Flow_1bblzfz\">\n        <di:waypoint x=\"830\" y=\"178\" />\n        <di:waypoint x=\"892\" y=\"178\" />\n      </bpmndi:BPMNEdge>\n    </bpmndi:BPMNPlane>\n  </bpmndi:BPMNDiagram>\n</bpmn:definitions>\n','ui_verify_flow','2026-09-30 02:06:19.000000','UI验证流程','ui_verify_flow:1:1f4f614e-f2a4-6e5f-3ee6-59d5fccd12a4','DEPLOYED','default','2026-09-30 02:06:19.000000',1,NULL);
/*!40000 ALTER TABLE `wf_process_draft` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_comment`
--

DROP TABLE IF EXISTS `wf_task_comment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_comment` (
  `id` varchar(64) NOT NULL,
  `action` varchar(32) NOT NULL,
  `comment` text DEFAULT NULL,
  `signature` longtext DEFAULT NULL COMMENT '手写签名 dataURL（signature.enabled 节点提交时存储，action=approve）',
  `created_at` datetime(6) DEFAULT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `target_user_id` varchar(64) DEFAULT NULL,
  `task_id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `user_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comment_task` (`tenant_id`,`task_id`),
  KEY `idx_comment_instance` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_comment`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_comment` WRITE;
/*!40000 ALTER TABLE `wf_task_comment` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_task_comment` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_remind`
--

DROP TABLE IF EXISTS `wf_task_remind`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_remind` (
  `id` varchar(64) NOT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `remind_from` varchar(64) NOT NULL,
  `remind_time` datetime(6) DEFAULT NULL,
  `remind_to` varchar(64) NOT NULL,
  `task_id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_remind_task` (`tenant_id`,`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_remind`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_remind` WRITE;
/*!40000 ALTER TABLE `wf_task_remind` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_task_remind` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Table structure for table `wf_task_transfer`
--

DROP TABLE IF EXISTS `wf_task_transfer`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wf_task_transfer` (
  `id` varchar(64) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `from_user` varchar(64) NOT NULL,
  `process_instance_id` varchar(64) NOT NULL,
  `reason` varchar(500) DEFAULT NULL,
  `task_id` varchar(64) NOT NULL,
  `tenant_id` varchar(64) NOT NULL,
  `to_user` varchar(64) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_transfer_task` (`tenant_id`,`task_id`),
  KEY `idx_transfer_instance` (`tenant_id`,`process_instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_uca1400_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wf_task_transfer`
--

SET @OLD_AUTOCOMMIT=@@AUTOCOMMIT, @@AUTOCOMMIT=0;
LOCK TABLES `wf_task_transfer` WRITE;
/*!40000 ALTER TABLE `wf_task_transfer` DISABLE KEYS */;
/*!40000 ALTER TABLE `wf_task_transfer` ENABLE KEYS */;
UNLOCK TABLES;
COMMIT;
SET AUTOCOMMIT=@OLD_AUTOCOMMIT;

--
-- Dumping routines for database 'workflow'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*M!100616 SET NOTE_VERBOSITY=@OLD_NOTE_VERBOSITY */;

-- Dump completed on 2026-10-10  6:14:54
